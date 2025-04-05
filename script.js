// Overpass APIで高速道路データを取得
async function fetchHighwayData(lat, lon) {
  const query = `[out:json];way["highway"="motorway"](around:500,${lat},${lon});out body;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  try {
      const response = await fetch(url);
      const data = await response.json();
      return data.elements;
  } catch (error) {
      console.error("Overpass APIエラー:", error);
      return [];
  }
}

// 2点間の距離
function getDistance(lat1, lon1, lat2, lon2) {
  return Math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2);
}

// 点と線の最短距離
function pointToLineDistance(lat, lon, point1, point2) {
  const x = lat, y = lon;
  const x1 = point1.lat, y1 = point1.lon;
  const x2 = point2.lat, y2 = point2.lon;

  const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (lengthSquared === 0) return getDistance(x, y, x1, y1);

  let t = ((x - x1) * (x2 - x1) + (y - y1) * (y2 - y1)) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  const projectionX = x1 + t * (x2 - x1);
  const projectionY = y1 + t * (y2 - y1);

  return getDistance(x, y, projectionX, projectionY);
}

// 高速道路判定（JSONデータから名前を取得）
async function checkHighway(lat, lon) {
  const highways = await fetchHighwayData(lat, lon);
  if (highways.length === 0) {
      return { highway: "高速道路外", direction: "なし", distance: null };
  }

  let closestHighway = null;
  let minDistance = Infinity;
  let closestSegment = null;

  for (const highway of highways) {
      const geometry = highway.geometry;
      const highwayName = highway.tags.name || "不明な高速道路"; // JSONから名前取得
      for (let i = 0; i < geometry.length - 1; i++) {
          const dist = pointToLineDistance(lat, lon, geometry[i], geometry[i + 1]);
          if (dist < minDistance) {
              minDistance = dist;
              closestHighway = highwayName;
              closestSegment = { start: geometry[i], end: geometry[i + 1] };
          }
      }
  }

  // 距離が0.0005（約50m）以内ならその高速道路とみなす
  if (minDistance < 0.0005) {
      let direction = "不明";
      if (closestHighway.includes("東名")) {
          direction = lat > closestSegment.start.lat ? "上り" : "下り";
      } else if (closestHighway.includes("首都")) {
          direction = lon > closestSegment.start.lon ? "外回り" : "内回り";
      }
      return { highway: closestHighway, direction, distance: minDistance };
  }
  return { highway: "高速道路外", direction: "なし", distance: minDistance };
}

// 位置情報取得と表示
function getLocation() {
  const infoDiv = document.getElementById("location-info");
  infoDiv.innerHTML = "<p>取得中...</p>";

  if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
          async (position) => {
              const coords = position.coords;
              const timestamp = position.timestamp;

              // 高速道路判定
              const highwayInfo = await checkHighway(coords.latitude, coords.longitude);

              infoDiv.innerHTML = `
                  <h2>${highwayInfo.highway}</h2>
                  <p><strong>方向:</strong> ${highwayInfo.direction}</p>
                  <p><strong>道路からの距離:</strong> ${highwayInfo.distance ? (highwayInfo.distance * 111000).toFixed(2) : "不明"} m</p>
                  <hr>
                  <p><strong>緯度 (Latitude):</strong> ${coords.latitude}</p>
                  <p><strong>経度 (Longitude):</strong> ${coords.longitude}</p>
                  <p><strong>高度 (Altitude):</strong> ${coords.altitude !== null ? coords.altitude + " m" : "取得不可"}</p>
                  <p><strong>位置精度 (Accuracy):</strong> ${coords.accuracy} m</p>
                  <p><strong>高度精度 (Altitude Accuracy):</strong> ${coords.altitudeAccuracy !== null ? coords.altitudeAccuracy + " m" : "取得不可"}</p>
                  <p><strong>進行方向 (Heading):</strong> ${coords.heading !== null ? coords.heading + "°" : "取得不可"}</p>
                  <p><strong>速度 (Speed):</strong> ${coords.speed !== null ? coords.speed + " m/s" : "取得不可"}</p>
                  <p><strong>取得時刻 (Timestamp):</strong> ${new Date(timestamp).toLocaleString()}</p>
              `;
          },
          (error) => {
              infoDiv.innerHTML = `<p>エラー: ${error.message}</p>`;
          }
      );
  } else {
      infoDiv.innerHTML = "<p>このブラウザは位置情報をサポートしていません</p>";
  }
}

console.log("Highway app started!");