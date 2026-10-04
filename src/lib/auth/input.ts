export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}
export function usernameEmail(value: string): string {
  const username = normalizeUsername(value);
  if (!/^[a-z0-9][a-z0-9_]{2,23}$/.test(username)) throw new Error("아이디는 영문·숫자·밑줄로 3~24자 입력하세요.");
  return `${username}@id.money.invalid`;
}
export interface SignupInput { username: string; displayName: string; password: string; code: string }
export function validateSignup(value: unknown): SignupInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("가입 정보를 확인하세요.");
  const input = value as Record<string, unknown>;
  if (typeof input.username !== "string" || typeof input.displayName !== "string" || typeof input.password !== "string" || typeof input.code !== "string") throw new Error("가입 정보를 모두 입력하세요.");
  const username = normalizeUsername(input.username);
  usernameEmail(username);
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 30) throw new Error("이름은 1~30자로 입력하세요.");
  if (input.password.length < 8 || new TextEncoder().encode(input.password).length > 72) throw new Error("비밀번호는 8자 이상 입력하세요. 한글 등은 최대 길이가 더 짧을 수 있습니다.");
  const code = input.code.trim().toUpperCase();
  if (!code || code.length > 128) throw new Error("회원가입 코드를 입력하세요.");
  return { username, displayName, password: input.password, code };
}
