import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ⚠️ غيّر القيمتين هذي بمفاتيح مشروعك من Supabase
// تجدهم في: Project Settings → API
export const supabase = createClient(
  "https://YOUR-PROJECT.supabase.co",
  "YOUR-PUBLISHABLE-KEY"
);

window.supabase = supabase;
