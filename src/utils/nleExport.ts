import { EditorProject, RenderedClip, TimedCaptionCue, EditorTrackItem } from '../types';

export interface NleExportResult {
  premiereXml: string;
  fcpxml: string;
  filenameBase: string;
}

export function escapeXml(unsafe: string = ''): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getFilenameBase(project: EditorProject, clip?: RenderedClip | null): string {
  const rawName = clip?.title || `vireoclip-${project.id.slice(0, 8)}`;
  return rawName.toLowerCase().replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '');
}

export function getVideoItems(project: EditorProject): EditorTrackItem[] {
  const videoTracks = project.tracks.filter((t) => t.type === 'VIDEO' && !t.hidden);
  if (videoTracks.length === 0) return [];
  return videoTracks
    .flatMap((t) => t.items)
    .sort((a, b) => a.timeline_start - b.timeline_start);
}

export function getCaptionCues(project: EditorProject, clip?: RenderedClip | null): TimedCaptionCue[] {
  const captionTrack = project.tracks.find((t) => t.type === 'CAPTION' && !t.hidden);
  if (captionTrack?.items?.[0]?.caption?.cues?.length) {
    return captionTrack.items[0].caption.cues;
  }
  if ((clip as any)?.caption_cues?.length) {
    return (clip as any).caption_cues;
  }
  return [];
}

/**
 * Generate Premiere Pro / DaVinci Resolve FCP 7 XML (.xml)
 */
export function generatePremiereXml(project: EditorProject, clip?: RenderedClip | null): string {
  const fps = project.canvas.fps || 30;
  const width = project.canvas.width || 1080;
  const height = project.canvas.height || 1920;
  const durationSec = project.canvas.duration || 30;
  const totalFrames = Math.max(1, Math.round(durationSec * fps));

  const clipTitle = clip?.title || `VireoClip Sequence`;
  const escapedTitle = escapeXml(clipTitle);
  const sourcePath = clip?.source_storage_path || 'file://localhost/source.mp4';
  const escapedSourcePath = escapeXml(sourcePath);
  const sourceFileName = escapeXml(sourcePath.split('/').pop() || 'source.mp4');

  const videoItems = getVideoItems(project);
  const captionCues = getCaptionCues(project, clip);

  let videoClipitemsXml = '';
  videoItems.forEach((item, index) => {
    const inFrame = Math.round(item.source_start * fps);
    const outFrame = Math.round(item.source_end * fps);
    const startFrame = Math.round(item.timeline_start * fps);
    const endFrame = Math.round(item.timeline_end * fps);
    const clipDuration = Math.max(1, outFrame - inFrame);
    const itemId = `clipitem-${index + 1}`;
    const itemName = escapeXml(item.name || `Slice ${index + 1}`);

    videoClipitemsXml += `
            <clipitem id="${itemId}">
              <name>${itemName}</name>
              <duration>${clipDuration}</duration>
              <rate>
                <timebase>${fps}</timebase>
                <ntsc>FALSE</ntsc>
              </rate>
              <start>${startFrame}</start>
              <end>${endFrame}</end>
              <in>${inFrame}</in>
              <out>${outFrame}</out>
              <file id="file-main">
                <name>${sourceFileName}</name>
                <pathurl>${escapedSourcePath}</pathurl>
                <rate>
                  <timebase>${fps}</timebase>
                  <ntsc>FALSE</ntsc>
                </rate>
                <duration>${Math.round(durationSec * fps * 2)}</duration>
                <media>
                  <video>
                    <samplecharacteristics>
                      <rate>
                        <timebase>${fps}</timebase>
                        <ntsc>FALSE</ntsc>
                      </rate>
                      <width>${width}</width>
                      <height>${height}</height>
                      <anamorphic>FALSE</anamorphic>
                      <pixelaspectratio>square</pixelaspectratio>
                      <fielddominance>none</fielddominance>
                    </samplecharacteristics>
                  </video>
                </media>
              </file>
            </clipitem>`;
  });

  let audioClipitemsXml = '';
  videoItems.forEach((item, index) => {
    const inFrame = Math.round(item.source_start * fps);
    const outFrame = Math.round(item.source_end * fps);
    const startFrame = Math.round(item.timeline_start * fps);
    const endFrame = Math.round(item.timeline_end * fps);
    const clipDuration = Math.max(1, outFrame - inFrame);
    const audioItemId = `audio-clipitem-${index + 1}`;
    const itemName = escapeXml(item.name || `Audio ${index + 1}`);

    audioClipitemsXml += `
            <clipitem id="${audioItemId}">
              <name>${itemName}</name>
              <duration>${clipDuration}</duration>
              <rate>
                <timebase>${fps}</timebase>
                <ntsc>FALSE</ntsc>
              </rate>
              <start>${startFrame}</start>
              <end>${endFrame}</end>
              <in>${inFrame}</in>
              <out>${outFrame}</out>
              <file id="file-main" />
            </clipitem>`;
  });

  let captionMarkersXml = '';
  captionCues.forEach((cue) => {
    const inFrame = Math.round(cue.start * fps);
    const outFrame = Math.round(cue.end * fps);
    const text = escapeXml(cue.text);

    captionMarkersXml += `
      <marker>
        <name>${text}</name>
        <comment>${text}</comment>
        <in>${inFrame}</in>
        <out>${outFrame}</out>
      </marker>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <project>
    <name>${escapedTitle}</name>
    <children>
      <sequence id="sequence-1">
        <name>${escapedTitle}</name>
        <duration>${totalFrames}</duration>
        <rate>
          <timebase>${fps}</timebase>
          <ntsc>FALSE</ntsc>
        </rate>
        <timecode>
          <rate>
            <timebase>${fps}</timebase>
            <ntsc>FALSE</ntsc>
          </rate>
          <string>00:00:00:00</string>
          <frame>0</frame>
          <displayformat>NDF</displayformat>
        </timecode>
        <media>
          <video>
            <format>
              <samplecharacteristics>
                <rate>
                  <timebase>${fps}</timebase>
                  <ntsc>FALSE</ntsc>
                </rate>
                <width>${width}</width>
                <height>${height}</height>
                <anamorphic>FALSE</anamorphic>
                <pixelaspectratio>square</pixelaspectratio>
                <fielddominance>none</fielddominance>
              </samplecharacteristics>
            </format>
            <track>${videoClipitemsXml}
            </track>
          </video>
          <audio>
            <numOutputChannels>2</numOutputChannels>
            <format>
              <samplecharacteristics>
                <depth>16</depth>
                <samplerate>48000</samplerate>
              </samplecharacteristics>
            </format>
            <track>${audioClipitemsXml}
            </track>
          </audio>
        </media>${captionMarkersXml}
      </sequence>
    </children>
  </project>
</xmeml>`;
}

/**
 * Generate Final Cut Pro X XML (.fcpxml)
 */
export function generateFcpxml(project: EditorProject, clip?: RenderedClip | null): string {
  const fps = project.canvas.fps || 30;
  const width = project.canvas.width || 1080;
  const height = project.canvas.height || 1920;
  const durationSec = project.canvas.duration || 30;

  const clipTitle = clip?.title || `VireoClip Sequence`;
  const escapedTitle = escapeXml(clipTitle);
  const sourcePath = clip?.source_storage_path || 'file://localhost/source.mp4';
  const escapedSourcePath = escapeXml(sourcePath);

  const videoItems = getVideoItems(project);
  const captionCues = getCaptionCues(project, clip);

  let spineXml = '';
  videoItems.forEach((item, index) => {
    const sliceDuration = Number((item.timeline_end - item.timeline_start).toFixed(3));
    const sourceStart = Number(item.source_start.toFixed(3));
    const timelineStart = Number(item.timeline_start.toFixed(3));
    const sliceName = escapeXml(item.name || `Slice ${index + 1}`);

    let sliceMarkersXml = '';
    captionCues.forEach((cue) => {
      if (cue.end > item.timeline_start && cue.start < item.timeline_end) {
        const relativeStart = Math.max(0, cue.start - item.timeline_start);
        const cueDuration = Math.min(sliceDuration - relativeStart, cue.end - cue.start);
        if (cueDuration > 0) {
          sliceMarkersXml += `
            <marker start="${relativeStart.toFixed(3)}s" duration="${cueDuration.toFixed(3)}s" value="${escapeXml(cue.text)}" />`;
        }
      }
    });

    spineXml += `
          <asset-clip name="${sliceName}" ref="r2" offset="${timelineStart}s" duration="${sliceDuration}s" start="${sourceStart}s">${sliceMarkersXml}
          </asset-clip>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat" width="${width}" height="${height}" frameDuration="1/${fps}s" />
    <asset id="r2" name="${escapedTitle}" src="${escapedSourcePath}" duration="${(durationSec * 2).toFixed(3)}s" hasVideo="1" hasAudio="1" audioSources="1" audioChannels="2" />
  </resources>
  <library>
    <event name="VireoClip Exports">
      <project name="${escapedTitle}">
        <sequence format="r1" duration="${durationSec.toFixed(3)}s">
          <spine>${spineXml}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
}

/**
 * Triggers browser download of text/xml file
 */
export function downloadXmlFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/xml;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
