# 배포와 되돌리기

**살아 있는 문서**다. 데모를 Vercel(앱)과 Neon(DB)에 올리고 되돌리는 법을 든다. 고른 까닭은 ADR 0002.

이 문서의 1 · 2 는 저자가 한 번만 한다 — Claude 의 작업 환경에서는 가입과 연결을 할 수 없다. 화면의 단추 이름이
여기와 다르면 비슷한 이름을 고르고, 그 이름을 Claude 에게 알려 주면 이 문서를 고친다.

## 1. Vercel 에 레포 잇기

1. <https://vercel.com/signup> 에서 **Continue with GitHub** 로 가입한다. 요금제는 **Hobby**(무료)를 고른다.
2. 대시보드에서 **Add New…** → **Project** 를 누른다.
3. **Import Git Repository** 목록에 `ERP2` 가 없으면 **Adjust GitHub App Permissions** 에서 `pdw96/ERP2` 를 허용한다.
4. `ERP2` 옆 **Import** → 설정은 그대로 두고(Framework 는 Next.js 로 저절로 잡힌다) **Deploy** 를 누른다.
5. 1 ~ 2분 뒤 데모 주소(`erp2-….vercel.app`)가 나온다. 이 주소가 채용 담당자에게 줄 데모 주소다.

이때부터 `main` 에 머지하면 데모가 저절로 바뀌고, PR 마다 Vercel 이 미리보기 주소를 PR 댓글로 단다.

## 2. Neon DB 를 만들어 잇기

1. Vercel 의 ERP2 프로젝트에서 **Storage** 탭 → **Create Database** → **Neon** 을 고른다.
2. **Region** 은 **Washington, D.C., USA (East)** 를 고른다 — Vercel 서버의 기본 위치와 같은 곳이라 화면과 DB 사이가 짧다.
3. **Auth** 는 끈다 — 로그인은 이 단계에서 만들지 않는다(조각 「인사」가 정한다). **Realtime** 도 끈 채로 둔다.
4. **Installation Plans** 는 **Free** 를 고르고 **Continue** 를 누른다.
5. 이을 환경은 **Production** 과 **Preview** 를 둘 다 켠다. 미리보기 배포마다 DB 분기를 만드는 선택지가 보이면 켠다 —
   PR 미리보기가 데모 DB 를 건드리지 않게 하는 장치다.
6. 다 만들면 Vercel 프로젝트의 환경변수에 `DATABASE_URL` 이 저절로 들어간다(**Settings** → **Environment Variables**
   에서 이름만 확인하면 된다).
7. **Deployments** 탭 → 맨 위 배포의 **⋯** → **Redeploy** 를 눌러 환경변수를 반영한다.

## 3. 확인하기

| 무엇 | 어디서 | 맞으면 |
|---|---|---|
| 화면 | 데모 주소 | 왼쪽에 메뉴 여섯, 가운데 자재 흐름도 |
| DB | 데모 주소 뒤에 `/health` | 「연결됨」과 한국 시각 |
| 자동 배포 | PR 을 머지하고 몇 분 뒤 데모 주소 | 머지한 변경이 보인다 |
| 미리보기 | PR 의 Vercel 댓글 | 미리보기 주소가 있고, 그 주소의 `/health` 도 「연결됨」 |
| 비용 | Vercel **Settings** → **Billing**, Neon 콘솔 **Billing** | Hobby · Free |

`/health` 가 「연결 안 됨」이면 화면의 안내 문구를 읽는다 — 「설정되지 않았습니다」는 2 의 6 · 7 을, 「닿지 못했습니다」는
Vercel 배포의 **Logs** 에 남은 `DB 연결 실패: <코드>` 를 확인한다. 로그에는 오류 코드만 남고 접속 정보는 남지 않는다.

## 되돌리기

배포한 데모가 잘못됐으면 이전 배포로 곧바로 되돌린다. 코드를 고치지 않아도 된다.

1. **Deployments** 탭에서 잘 돌던 이전 배포를 찾는다.
2. 그 배포의 **⋯** → **Instant Rollback**(또는 **Promote to Production**)을 누른다.
3. 데모 주소를 새로고침해 이전 화면이 보이는지 본다.
4. 고친 코드가 머지되면 새 배포가 데모를 다시 덮는다. 되돌린 상태를 풀려면 최신 배포의 **⋯** → **Promote to Production**.

DB 의 데이터는 되돌리기로 돌아가지 않는다 — 배포만 이전 것으로 바뀐다. DB 를 바꾸는 마이그레이션의 되돌림은 그것을
처음 다는 조각 「기준정보」가 정한다(`docs/schema.md`).
