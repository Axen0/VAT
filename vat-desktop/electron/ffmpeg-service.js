const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { app } = require('electron');
const torrentManager = require('./torrent-manager');

// Configure fluent-ffmpeg to use static binaries
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

class FFmpegService {
  constructor() {
    this.queue = [];
    this.currentJob = null;
    this.isProcessing = false;
    this.ffmpegProcess = null;
    this.currentJobProgress = 0;

    // Cleanup on app exit
    app.on('before-quit', () => {
      this.clearQueue();
    });
  }

  async getMediaInfo(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, async (err, metadata) => {
        if (err) return reject(err);

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        const format = metadata.format;

        // Split by comma and take the first one, convert to lowercase for easier checking
        const formatName = format.format_name.split(',')[0].trim().toLowerCase();

        const info = {
          duration: Math.round(metadata.format.duration || 0),
          codec: videoStream ? videoStream.codec_name : 'unknown',
          resolution: videoStream ? `${videoStream.width}x${videoStream.height}` : '0x0',
          fps: videoStream && videoStream.r_frame_rate ? eval(videoStream.r_frame_rate) : 0,
          bitrate: Math.round((format.bit_rate || 0) / 1000), // kbps
          audioCodec: audioStream ? audioStream.codec_name : 'unknown',
          fileSize: format.size || 0,
          format: formatName,
          fileExtension: path.extname(filePath).toLowerCase().slice(1), // mp4, mkv, mov, etc.
          isBrowserCompatible: false
        };

        // Browser compatibility: MP4/MOV/M4V with H.264 + AAC/MP3/Opus/unknown (no audio) OR WebM with VP8/VP9/AV1
        const isMp4Like = formatName.includes('mp4') || formatName.includes('mov') || formatName.includes('m4v');
        const isAudioCompatible = ['aac', 'mp3', 'opus', 'unknown'].includes(info.audioCodec);
        const isMp4Compatible = isMp4Like && info.codec === 'h264' && isAudioCompatible;
        const isWebmCompatible = formatName.includes('webm') && ['vp8', 'vp9', 'av1'].includes(info.codec);
        
        info.isBrowserCompatible = isMp4Compatible || isWebmCompatible;

        resolve(info);
      });
    });
  }

  getAvailableQualities(originalResolution) {
    const qualities = [
      { label: '1080p', resolution: '1920x1080', height: 1080 },
      { label: '720p', resolution: '1280x720', height: 720 },
      { label: '480p', resolution: '854x480', height: 480 },
      { label: '360p', resolution: '640x360', height: 360 }
    ];

    const [width, height] = originalResolution.split('x').map(Number);
    const originalHeight = height || 1080;

    const available = [{ label: 'original', resolution: originalResolution, height: originalHeight }];
    
    for (const q of qualities) {
      if (q.height < originalHeight) {
        available.push(q);
      }
    }
    return available;
  }

  checkBrowserCompatibility(filePath) {
    return this.getMediaInfo(filePath).then(info => {
      console.log('[FFmpeg] checkBrowserCompatibility info:', info);
      
      if (info.isBrowserCompatible) {
        return { compatible: true, reason: null, suggestedAction: 'none' };
      }
      
      const formatLower = info.format.toLowerCase();
      const extLower = info.fileExtension.toLowerCase();
      
      console.log('[FFmpeg] formatLower:', formatLower, 'extLower:', extLower);
      
      // If file has .mp4 or .m4v extension, H.264 video, and compatible/unknown audio, it's browser-compatible
      if ((extLower === 'mp4' || extLower === 'm4v') && info.codec === 'h264' && ['aac', 'mp3', 'opus', 'unknown'].includes(info.audioCodec)) {
        console.log('[FFmpeg] Matched by extension rule -> compatible');
        return { compatible: true, reason: null, suggestedAction: 'none' };
      }
      
      // If it's MKV or MOV (with .mov extension) with H.264, remuxing to MP4 usually fixes browser compatibility
      if ((formatLower.includes('mkv') || (formatLower.includes('mov') && extLower === 'mov')) && info.codec === 'h264') {
        return { 
          compatible: false, 
          reason: `${info.format.toUpperCase()} container is not broadly supported, but video codec is good`, 
          suggestedAction: 'remux' 
        };
      }
      
      return { 
        compatible: false, 
        reason: `Format ${info.format} or codec ${info.codec} is not supported`, 
        suggestedAction: 'convert' 
      };
    });
  }

  async remuxToMp4(inputPath, outputPath, eventSender) {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .outputOptions(['-c', 'copy'])
        .output(outputPath)
        .on('start', (cmd) => {
          console.log('[FFmpeg] Remux started:', cmd);
        })
        .on('progress', (progress) => {
          if (eventSender) {
            eventSender.send('ffmpeg:progress', { percent: progress.percent || 0, eta: 0 });
          }
        })
        .on('end', () => {
          console.log('[FFmpeg] Remux completed');
          resolve({ outputPath });
        })
        .on('error', (err) => {
          console.error('[FFmpeg] Remux error:', err);
          reject(err);
        });
      
      this.ffmpegProcess = command;
      command.run();
    });
  }

  async convertVideo(inputPath, outputPath, targetResolution, eventSender, roomDir) {
    // Check if already exists
    if (fsSync.existsSync(outputPath)) {
      console.log('[FFmpeg] File already exists, skipping conversion:', outputPath);
      const seedResult = await torrentManager.seedFile(outputPath, roomDir || path.dirname(outputPath));
      return { outputPath, magnetURI: seedResult.magnetURI };
    }

    const jobId = Date.now().toString();
    const job = {
      id: jobId,
      type: 'video',
      inputPath,
      outputPath,
      targetResolution,
      eventSender,
      roomDir: roomDir || path.dirname(outputPath)
    };

    return this.addToQueue(job);
  }

  async convertAudio(inputPath, outputPath, bitrate, eventSender) {
    if (fsSync.existsSync(outputPath)) {
      console.log('[FFmpeg] File already exists, skipping conversion:', outputPath);
      return { outputPath };
    }

    const jobId = Date.now().toString();
    const job = {
      id: jobId,
      type: 'audio',
      inputPath,
      outputPath,
      bitrate,
      eventSender
    };

    return this.addToQueue(job);
  }

  addToQueue(job) {
    return new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
      this.queue.push(job);
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    this.currentJob = this.queue.shift();
    this.currentJobProgress = 0;

    try {
      let result;
      if (this.currentJob.type === 'video') {
        result = await this._executeVideoConversion(this.currentJob);
      } else if (this.currentJob.type === 'audio') {
        result = await this._executeAudioConversion(this.currentJob);
      }
      
      this.currentJob.resolve(result);
    } catch (error) {
      this.currentJob.reject(error);
    } finally {
      this.currentJob = null;
      this.currentJobProgress = 0;
      this.isProcessing = false;
      this.processQueue(); // Process next
    }
  }

  _executeVideoConversion(job) {
    return new Promise((resolve, reject) => {
      const [width, height] = job.targetResolution.split('x');
      
      const command = ffmpeg(job.inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .size(`${width}x${height}`)
        .videoBitrate('1500k')
        .audioBitrate('128k')
        // CORRECTED: Each option and its value must be separate array elements
        .outputOptions(['-preset', 'medium', '-crf', '23', '-movflags', '+faststart'])
        .output(job.outputPath)
        .on('start', (cmd) => {
          console.log('[FFmpeg] Video conversion started');
        })
        .on('progress', (progress) => {
          this.currentJobProgress = progress.percent || 0;
          if (job.eventSender) {
            job.eventSender.send('ffmpeg:progress', { 
              percent: Math.round(this.currentJobProgress), 
              eta: progress.timemark ? 'calculating...' : 0 
            });
          }
        })
        .on('end', async () => {
          console.log('[FFmpeg] Video conversion completed');
          try {
            const seedResult = await torrentManager.seedFile(job.outputPath, job.roomDir);
            resolve({ outputPath: job.outputPath, magnetURI: seedResult.magnetURI });
          } catch (err) {
            reject(err);
          }
        })
        .on('error', async (err) => {
          console.error('[FFmpeg] Video conversion error:', err);
          // Delete incomplete file
          try {
            await fs.unlink(job.outputPath);
          } catch (e) { /* ignore */ }
          reject(err);
        });

      this.ffmpegProcess = command;
      command.run();
    });
  }

  _executeAudioConversion(job) {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(job.inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate(job.bitrate)
        .output(job.outputPath)
        .on('start', () => console.log('[FFmpeg] Audio conversion started'))
        .on('progress', (progress) => {
          this.currentJobProgress = progress.percent || 0;
          if (job.eventSender) {
            job.eventSender.send('ffmpeg:progress', { percent: Math.round(this.currentJobProgress), eta: 0 });
          }
        })
        .on('end', () => {
          console.log('[FFmpeg] Audio conversion completed');
          resolve({ outputPath: job.outputPath });
        })
        .on('error', async (err) => {
          console.error('[FFmpeg] Audio conversion error:', err);
          try { await fs.unlink(job.outputPath); } catch (e) { /* ignore */ }
          reject(err);
        });

      this.ffmpegProcess = command;
      command.run();
    });
  }

  cancelConversion(jobId) {
    // If it's the current job
    if (this.currentJob && this.currentJob.id === jobId) {
      if (this.ffmpegProcess) {
        this.ffmpegProcess.kill('SIGKILL');
        this.ffmpegProcess = null;
      }
      // Delete incomplete file
      fs.unlink(this.currentJob.outputPath).catch(() => {});
      this.currentJob = null;
      this.currentJobProgress = 0;
      this.isProcessing = false;
      this.processQueue();
      return true;
    }

    // If it's in the queue
    const index = this.queue.findIndex(j => j.id === jobId);
    if (index !== -1) {
      const job = this.queue.splice(index, 1)[0];
      fs.unlink(job.outputPath).catch(() => {});
      return true;
    }

    return false;
  }

  getQueueStatus() {
    return {
      currentJob: this.currentJob ? {
        id: this.currentJob.id,
        type: this.currentJob.type,
        progress: this.currentJobProgress
      } : null,
      queue: this.queue.map(j => ({ id: j.id, type: j.type })),
      currentJobProgress: this.currentJobProgress
    };
  }

  clearQueue() {
    if (this.ffmpegProcess) {
      this.ffmpegProcess.kill('SIGKILL');
      this.ffmpegProcess = null;
    }
    if (this.currentJob) {
      fs.unlink(this.currentJob.outputPath).catch(() => {});
      this.currentJob = null;
    }
    for (const job of this.queue) {
      fs.unlink(job.outputPath).catch(() => {});
    }
    this.queue = [];
    this.isProcessing = false;
    this.currentJobProgress = 0;
  }
}

module.exports = new FFmpegService();