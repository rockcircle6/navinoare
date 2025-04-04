console.log("Highway app started!");
navigator.geolocation.getCurrentPosition(position => {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  document.body.innerHTML += `<p>現在地: 緯度 ${lat}, 経度 ${lon}</p>`;
});
const highwayData = {
  "東名高速道路": {
    start: { lat: 35.171, lon: 136.881 },
    facilities: [{ type: "SA", name: "海老名SA", kp: 45 }]
  }
};