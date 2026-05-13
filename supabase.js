import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ⚠️ غيّر القيمتين هذي بمفاتيح مشروعك من Supabase
// تجدهم في: Project Settings → API
export const supabase = createClient(
  "https://uxhpzxdfgapnfmporlwj.supabase.co",
  "sb_publishable_6os3pBqyHz6GO-yjqG8uqA_6BjAYkW5"
);

window.supabase = supabase;
