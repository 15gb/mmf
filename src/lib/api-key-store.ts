// .env 파일에서 VITE_GEMINI_API_KEY_ 로 시작하는 키들을 찾습니다.
const getApiKeys = (): string[] => {
  const keys: string[] = [];
  
  // Vite의 import.meta.env는 정적 분석을 통해 값으로 대체되므로,
  // 동적 인덱싱([])이 아닌 명시적 접근이 필요합니다.
  const k0 = import.meta.env.VITE_GEMINI_API_KEY;
  const k1 = import.meta.env.VITE_GEMINI_API_KEY_1;
  const k2 = import.meta.env.VITE_GEMINI_API_KEY_2;
  const k3 = import.meta.env.VITE_GEMINI_API_KEY_3;
  const k4 = import.meta.env.VITE_GEMINI_API_KEY_4;
  const k5 = import.meta.env.VITE_GEMINI_API_KEY_5;

  if (k0) keys.push(k0);
  if (k1) keys.push(k1);
  if (k2) keys.push(k2);
  if (k3) keys.push(k3);
  if (k4) keys.push(k4);
  if (k5) keys.push(k5);

  // 중복 제거 및 빈 값 필터링
  return Array.from(new Set(keys)).filter(Boolean);
};

const apiKeys = getApiKeys();

interface ApiKeyState {
  keys: string[];
  currentIndex: number;
}

// 싱글톤 상태 관리 객체
const state: ApiKeyState = {
  keys: apiKeys,
  currentIndex: 0,
};

export const useApiKeyStore = {
  getState: () => ({
    getNextKey: () => {
      if (state.keys.length === 0) {
        throw new Error("Gemini API 키가 설정되지 않았습니다. .env 파일을 확인해주세요.");
      }
      return state.keys[state.currentIndex];
    },
    rotateKey: () => {
      if (state.keys.length <= 1) {
        console.warn("사용 가능한 API 키가 하나뿐이므로 키를 순환할 수 없습니다.");
        return;
      }
      state.currentIndex = (state.currentIndex + 1) % state.keys.length;
      console.warn(`API 키 할당량 초과. 다음 키로 전환합니다 (인덱스: ${state.currentIndex})`);
    }
  })
};
