function getLocation() {
  const infoDiv = document.getElementById("location-info");
  infoDiv.innerHTML = "<p>取得中...</p>";

  if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
          (position) => {
              const coords = position.coords;
              const timestamp = position.timestamp;

              // 高速道路判定
              const highwayInfo = checkHighway(coords.latitude, coords.longitude);

              infoDiv.innerHTML = `
                  <p><strong>高速道路:</strong> ${highwayInfo.highway}</p>
                  <p><strong>方向:</strong> ${highwayInfo.direction}</p>
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


// 2点間の距離（簡易的に直線距離、実際は球面距離を使うべきだけど）
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

// 高速道路判定
function checkHighway(lat, lon) {
  let closestHighway = null;
  let minDistance = Infinity;
  let closestSegment = null;

  for (const highway in highwayData) {
      const points = highwayData[highway].points;
      for (let i = 0; i < points.length - 1; i++) {
          const dist = pointToLineDistance(lat, lon, points[i], points[i + 1]);
          if (dist < minDistance) {
              minDistance = dist;
              closestHighway = highway;
              closestSegment = { start: points[i], end: points[i + 1] };
          }
      }
  }

  // 距離が0.0005（約50m）以内ならその高速道路とみなす
  if (minDistance < 0.0005) {
      const highway = highwayData[closestHighway];
      let direction = "不明";
      if (closestHighway === "東名高速道路") {
          direction = lat > closestSegment.start.lat ? "上り" : "下り";
      } else if (closestHighway === "首都高速") {
          direction = lon > closestSegment.start.lon ? "外回り" : "内回り";
      }
      return { highway: closestHighway, direction: highway.direction[direction], distance: minDistance };
  }
  return { highway: "高速道路外", direction: "なし", distance: minDistance };
}

const highwayData = {
  "東名高速道路": {
      points: [
          { lat: 35.171, lon: 136.881 }, // 名古屋IC
          { lat: 35.188, lon: 136.913 }, // 名古屋南JCT
          { lat: 35.243, lon: 137.123 }, // 豊田JCT
          { lat: 35.277, lon: 137.312 }, // 岡崎IC
          { lat: 35.312, lon: 137.543 }, // 音羽蒲郡IC
          { lat: 35.366, lon: 137.873 }, // 静岡IC
          { lat: 35.401, lon: 138.123 }, // 清水IC
          { lat: 35.445, lon: 138.345 }, // 沼津IC
          { lat: 35.482, lon: 138.567 }, // 富士IC
          { lat: 35.512, lon: 138.789 }, // 御殿場IC
          { lat: 35.567, lon: 138.945 }, // 裾野IC
          { lat: 35.623, lon: 139.123 }, // 厚木IC
          { lat: 35.645, lon: 139.345 }, // 海老名JCT
          { lat: 35.681, lon: 139.691 }  // 東京IC
      ],
      direction: {
          "上り": "東京方面",
          "下り": "名古屋方面"
      }
  },
  "首都高速": {
      points: [
          { lat: 35.689, lon: 139.692 }, // 霞が関
          { lat: 35.711, lon: 139.723 }, // 竹橋JCT
          { lat: 35.735, lon: 139.756 }, // 江戸橋JCT
          { lat: 35.765, lon: 139.880 }, // 葛飾区（小菅JCT）
          { lat: 35.723, lon: 139.912 }, // 四つ木IC
          { lat: 35.671, lon: 139.845 }, // 堀切JCT
          { lat: 35.623, lon: 139.776 }, // 品川
          { lat: 35.601, lon: 139.701 }, // 大井JCT
          { lat: 35.645, lon: 139.623 }, // 荻窪
          { lat: 35.671, lon: 139.601 }  // 高井戸
      ],
      direction: {
          "内回り": "時計回り",
          "外回り": "反時計回り"
      }
  }
};