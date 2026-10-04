# sang
# sang

부부가 함께 쓰는 가족 가계부 개발 프로젝트입니다. 기존 내용과 index.html은 보존했습니다.

코드 업로드 대상: [kimsanghwa14-cpu/money](https://github.com/kimsanghwa14-cpu/money). 사용자 요청에 따라 앞으로 코드 업로드는 이 저장소를 사용합니다. 소스 코드와 문서를 이 저장소에서 관리합니다.

- Cloudflare Pages 배포: [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md) (`npm run build`, 출력 `dist`)
- 실행: Node.js 22.18 이상에서 `npm install`, 환경변수 설정 후 `npm run dev`
- 설치·Supabase·가족 승인: [docs/SETUP.md](docs/SETUP.md)
- 구현·미구현·실행한 검증: [docs/STATUS.md](docs/STATUS.md)
- ChatGPT 거래 정리 프롬프트·초안 규격: [docs/IMPORT.md](docs/IMPORT.md)
- 계산·입력 검증: `npm test`

Supabase DB와 기존 Cloudflare 사이트를 연결했습니다. 로그인은 아이디·비밀번호 방식이며, `/signup`에서 유효한 가입 코드를 입력한 경우에만 가족 계정이 생성됩니다. 가입 코드 원문과 관리자 키는 공개 코드에 포함하지 않습니다. 최신 구현·검증 상태는 `docs/STATUS.md`를 확인하세요.
