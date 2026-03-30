import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// 모바일 디버깅을 위한 에러 핸들러
window.onerror = function(message, source, lineno, colno, error) {
  alert(`Error: ${message}\nSource: ${source}\nLine: ${lineno}`);
  return false;
};

// PWA 서비스 워커 등록 (브라우저 지원 여부 확인)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({
        onNeedRefresh() {
          if (confirm("새로운 버전의 앱이 있습니다. 업데이트하시겠습니까?")) {
            window.location.reload();
          }
        },
        onOfflineReady() {
          console.log("앱이 오프라인에서 사용할 준비가 되었습니다.");
        },
      });
    })
    .catch((err) => {
      console.error("PWA registration failed:", err);
    });
}

createRoot(document.getElementById("root")!).render(<App />);
