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

기존 Cloudflare 사이트의 코드 배포는 완료했습니다. 2026-10-04 Supabase 프로젝트에 가계부 DB 구조를 적용했고, 원자적 저장·재시도·버전 충돌·가족 RLS SQL 검증이 통과했습니다. 사이트의 공개 연결 설정을 코드로 관리하며, 실제 가족 이메일 계정 등록과 승인·로그인 검증은 아직 남아 있습니다. 최신 상세 상태는 `docs/STATUS.md`를 확인하세요.
