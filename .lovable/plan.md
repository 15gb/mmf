

## Plan: 캐릭터 검색 말투 강화 + 대화 저장 기능

### 1. 캐릭터 검색 시 말투/대사 정보 추가

**변경 파일:** `supabase/functions/character-search/index.ts`

- 시스템 프롬프트에 "speech_style" 필드를 추가하여 캐릭터의 특징적인 말투, 말버릇, 자주 쓰는 표현, 대표 대사 등을 상세히 반환하도록 수정
- 반환된 speech_style 정보를 persona 필드에 통합하여 전달 (기존 persona에 말투 정보를 함께 포함)

**변경 파일:** `src/components/CharacterSearch.tsx`
- 응답에서 speech_style을 받아 persona에 합쳐서 설정 폼에 반영

### 2. 대화 저장/불러오기 기능

현재 인증 시스템이 없으므로 localStorage 기반으로 여러 대화를 저장/관리하는 기능을 구현합니다.

**변경 파일:** `src/lib/store.ts`
- `Conversation` 인터페이스 추가 (id, title, messages, createdAt, updatedAt)
- `useConversations()` 훅 추가: 대화 목록 CRUD (저장, 불러오기, 삭제, 새 대화 시작)
- 기존 `useMessages()`에 현재 대화 ID 개념 추가

**새 파일:** `src/pages/ConversationListPage.tsx`
- 저장된 대화 목록을 표시하는 페이지
- 각 대화 항목에 제목, 날짜, 삭제 버튼
- 새 대화 시작 버튼

**변경 파일:** `src/pages/ChatPage.tsx`
- 헤더에 "대화 저장" 버튼 추가
- 대화 목록 페이지로 이동하는 버튼 추가
- 저장된 대화를 불러오는 기능 연동

**변경 파일:** `src/App.tsx`
- `/conversations` 라우트 추가

### Technical Details

- 대화 데이터는 `localStorage`에 `saved-conversations` 키로 저장 (배열 형태)
- 각 대화에는 자동 생성 제목 (첫 번째 사용자 메시지의 앞 30자) 부여
- 현재 대화를 저장하면 conversations 배열에 추가, 이미 저장된 대화면 업데이트
- DB 테이블 없이 로컬 저장 방식으로 구현 (인증 없이 작동)

