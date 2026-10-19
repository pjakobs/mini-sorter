// Settings from the control panel. Shared on purpose: the panel writes them and the simulation reads them.
export const settings = {
  speed: 1.2, // m/s
  /** @type {import('./parcels.js').DestChoice} chute for new parcels, or R for random */
  dest: 'R',
  auto: false, // auto-feed on
  rate: 10, // auto-feed parcels per minute
};
