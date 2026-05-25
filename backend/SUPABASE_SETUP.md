# Supabase Setup

이 프로젝트의 회원가입/로그인은 MongoDB 대신 Supabase의 `users` 테이블을 사용합니다.

## 필요한 환경 변수

`backend/.env`에 아래 값을 넣으세요.

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_USERS_TABLE=users
JWT_SECRET=your_secure_random_value
JWT_EXPIRE=7d
```

## 테이블 구조

Supabase SQL Editor에서 아래 SQL을 실행하세요.

```sql
create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text not null unique,
  password_hash text not null,
  name text,
  avatar text default '',
  login_type text not null default 'password',
  last_login timestamptz not null default now(),
  settings jsonb not null default '{"monthlyBudget":50000,"preferredCategories":[],"preferredDietary":[]}'::jsonb,
  ingredients jsonb not null default '[]'::jsonb,
  shopping jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();
```

## 동작 방식

- 회원가입: `username`, `email`, `password_hash`를 `users` 테이블에 저장합니다.
- 로그인: `username` 또는 `email`로 행을 찾고 `password_hash`를 bcrypt로 검증합니다.
- 세션: 로그인 성공 시 기존처럼 백엔드가 JWT를 발급합니다.
