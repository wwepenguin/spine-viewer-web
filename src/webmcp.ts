import type { SkeletonViewer } from './viewer';
import type { WebTool } from './types';

/** Optional browser API; ordinary browsers use the same DOM controls without it. */
export function registerViewerTools(viewer: SkeletonViewer, sync: () => void): void {
  const context = (
    document as Document & { modelContext?: { registerTool(tool: WebTool): void | Promise<void> } }
  ).modelContext;
  if (!context) return;
  const register = (tool: WebTool) => {
    try {
      Promise.resolve(context.registerTool(tool)).catch(() => {});
    } catch {
      /* Optional integration. */
    }
  };
  register({
    name: 'read_skeleton_viewer',
    description: 'Read loaded skeleton, slots, animations and playback state.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => viewer.snapshot(),
  });
  register({
    name: 'select_skeleton_slot',
    description: 'Select a slot by exact name and highlight it. Null clears selection.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: ['string', 'null'] } },
      required: ['name'],
      additionalProperties: false,
    },
    execute: (input) => {
      if (input.name !== null && typeof input.name !== 'string')
        throw Error('name must be a string or null');
      viewer.selectSlot(input.name);
      return {
        selectedSlot: viewer.selectedSlot,
        highlight: viewer.selectedSlot ? viewer.lastHighlight : null,
      };
    },
  });
  register({
    name: 'configure_skeleton_playback',
    description: 'Set animation, track, pause or animation time using the viewer controls.',
    inputSchema: {
      type: 'object',
      properties: {
        animation: { type: 'string' },
        track: { type: 'integer', minimum: 0, maximum: 5 },
        paused: { type: 'boolean' },
        time: { type: 'number', minimum: 0 },
      },
      additionalProperties: false,
    },
    execute: (input) => {
      const { track, animation, time, paused } = input;
      if (
        track !== undefined &&
        (typeof track !== 'number' || !Number.isInteger(track) || track < 0 || track > 5)
      )
        throw Error('Invalid track');
      if (
        animation !== undefined &&
        (typeof animation !== 'string' ||
          !viewer.asset?.spineData.animations.some((a) => a.name === animation))
      )
        throw Error('Unknown animation');
      if (time !== undefined && (typeof time !== 'number' || !Number.isFinite(time) || time < 0))
        throw Error('Invalid time');
      if (paused !== undefined && typeof paused !== 'boolean') throw Error('Invalid paused value');
      if (typeof track === 'number') viewer.setTrack(track);
      if (typeof animation === 'string') viewer.play(animation);
      if (typeof time === 'number') viewer.seek(time);
      if (typeof paused === 'boolean') viewer.paused = paused;
      sync();
      return viewer.snapshot();
    },
  });
}
