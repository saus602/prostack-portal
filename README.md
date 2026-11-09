# ProStack Client Portal

Static site (no build step). Talks to the "ProStack Clients" Supabase project.

## Deploy
Upload the contents of this folder to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, or cPanel public_html).

## Required Supabase settings (Dashboard > Authentication)
1. URL Configuration: set Site URL and Redirect URLs to your deployed address.
2. Providers > Email: keep "Confirm email" on. Raise minimum password length to 8+ and enable leaked-password protection.
3. Add yourself as staff (only after you have signed up): in the SQL editor run
   insert into public.staff (user_id) select id from auth.users where email = 'YOUR EMAIL';

## Before taking real clients
- Have an attorney review the terms of use, the fee model (CROA / FTC advance-fee rules), and the affiliate disclosure.
- Add a real terms/privacy page and support contact, and link them in the footer.
- Never collect SSNs, full reports, or card/bank numbers.
