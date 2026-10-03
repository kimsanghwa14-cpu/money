import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
test("Supabase DB: 원자적 저장·RLS·재시도·고정비·충돌 통합 검증",t=>{
  const url=process.env.TEST_DATABASE_URL;
  if(!url){t.skip("TEST_DATABASE_URL이 없어 DB 통합 테스트를 실행하지 않았습니다.");return;}
  const available=spawnSync("psql",["--version"],{encoding:"utf8"});
  if(available.error){t.skip("psql이 없어 DB 통합 테스트를 실행하지 않았습니다.");return;}
  const result=spawnSync("psql",["-X","-v","ON_ERROR_STOP=1","-f","tests/database.sql"],{env:{...process.env,PGDATABASE:url},encoding:"utf8",timeout:120000});
  assert.equal(result.status,0,result.stderr||"DB 통합 테스트가 완료되지 않았습니다.");
  assert.match(result.stdout,/DB_CHECKS_PASSED/);
});
