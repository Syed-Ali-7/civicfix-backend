const { getDistance } = require('geolib');

const calculateDistanceMeters = (from, to) => {
  return getDistance(
    { latitude: Number(from.latitude), longitude: Number(from.longitude) },
    { latitude: Number(to.latitude), longitude: Number(to.longitude) }
  );
};

module.exports = {
  calculateDistanceMeters,
};
