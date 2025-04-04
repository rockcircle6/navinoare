function getLocation() {
  const infoDiv = document.getElementById("location-info");
  infoDiv.innerHTML = "<p>取得中...</p>";

  if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
          (position) => {
              const coords = position.coords;
              const timestamp = position.timestamp;

              // 全情報を表示
              infoDiv.innerHTML = `
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

// ページ読み込み時に自動で取得（任意）
console.log("Highway app started!");
// getLocation(); // 自動実行したいなら外す