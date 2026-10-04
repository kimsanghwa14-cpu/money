# 기존 Cloudflare Pages 사이트에 배포

`money-ab4.pages.dev` 주소를 유지한다. `npm run build`는 React 화면을 Vite로 빌드해 `dist/`를 생성한다. `functions/[[path]].ts`는 Cloudflare Pages Functions에서 로그인 쿠키 확인, 이메일 로그인 콜백, 가족 승인 및 저장 API를 처리한다. Next.js 전용 모듈은 Pages 빌드에서 사용하지 않는다. 기존 Next.js 실행은 `npm run dev`, Next.js 빌드는 `npm run build:next`로 계속 사용할 수 있다.

## Cloudflare 설정

Cloudflare → Workers & Pages → **money** → Settings → Build에서 아래처럼 설정하고 저장한다. 설정 화면에서 자동 감지된 다른 프레임워크 명령어가 남아 있으면 수정한다.

| 항목 | 값 |
| --- | --- |
| Framework preset | Vite 또는 None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | 저장소 루트 (비워 둠) |
| Production branch | `main` |

환경변수의 Production에 다음 값을 추가한다. Preview 배포도 사용할 경우 Preview에도 같은 종류의 설정을 추가하되, 필요하면 별도의 테스트 Supabase 프로젝트를 사용한다.

| 변수 | 값 |
| --- | --- |
| `NODE_VERSION` | `22.18.0` 이상 (예: `24.21.0`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable 또는 기존 anon 공개 키 |
| `NEXT_PUBLIC_SITE_URL` | `https://money-ab4.pages.dev` |

`NEXT_PUBLIC_*` 세 변수는 **빌드 환경과 Pages Functions 실행 환경 모두**에 제공해야 한다. 공개 키를 포함하는 두 값은 브라우저 빌드에 포함되므로 secret/service-role 키를 사용하지 않는다. 환경변수가 없으면 가계부는 빈 화면 대신 DB 연결 안내를 표시한다. 환경변수 변경 후에는 새 빌드를 실행해야 한다.

Deployments에서 최신 `main` 커밋을 다시 배포한다. 빌드 로그에 Vite 빌드, `dist/index.html`, Functions 컴파일이 확인되어야 한다. 소스 폴더 자체나 `.next` 폴더를 출력 디렉터리로 지정하지 않는다. `index.html` 소스 파일을 그대로 올리면 앱은 실행되지 않는다.

## Supabase 연결

`docs/SETUP.md`의 마이그레이션·가족 승인 절차를 먼저 완료한다. Supabase → Authentication → URL Configuration에 아래 값을 등록한다.

- Site URL: `https://money-ab4.pages.dev`
- Redirect URLs: `https://money-ab4.pages.dev/auth/callback`

## 확인

1. Supabase 환경변수 없이 배포: `/`에 **가족 DB 연결이 필요합니다** 안내가 표시된다.
2. 환경변수 설정 후 비로그인 상태: `/`에서 `/login`으로 이동한다.
3. `/api/session`: 비로그인 상태는 JSON 응답 HTTP 401, DB 미설정 상태는 HTTP 503이다. HTML이나 앱 소스가 반환되면 Functions가 배포되지 않은 것이다.
4. 승인된 가족 계정으로 로그인: 집계표와 실제 가족 데이터가 조회된다.
5. 이메일 로그인 링크: `/auth/callback`에서 로그인 쿠키를 설정하고 `/`로 돌아온다.
6. 전용 테스트 가족에서 거래 저장 후 새로고침: DB에 저장한 데이터가 남는다.

인증·API 응답은 `private, no-store`로 처리한다. 가족 인증, 요청 origin 검증, 입력 검증, DB RPC/RLS는 기존 구현을 공유한다.

## 로컬 확인

```bash
npm install
npm test
npm run test:pages
npm run typecheck
npm run build
npx wrangler pages functions build --outdir /tmp/money-pages-functions
cp .env.example .env.local
cp .dev.vars.example .dev.vars
# 두 환경 파일에 동일한 개발용 Supabase 공개 설정을 채운 후:
npm run preview:pages
```

`preview:pages`는 빌드 결과와 실제 Pages Functions를 함께 실행한다. `dev:pages`는 화면 개발용 Vite 서버만 실행하므로 로그인·저장 API 검증에는 `preview:pages`를 사용한다.

공식 참고: [Vite의 Pages 빌드 설정](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/), [Pages Functions](https://developers.cloudflare.com/pages/functions/), [Pages SPA 기본 라우팅](https://developers.cloudflare.com/pages/configuration/serving-pages/#single-page-application-spa-rendering).
