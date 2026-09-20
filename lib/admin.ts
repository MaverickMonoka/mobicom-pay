import { cookies } from 'next/headers';
import { safeEqual } from './crypto';
export async function isAdmin(){const token=(await cookies()).get('mobicom_pay_admin')?.value||'';const expected=process.env.ADMIN_TOKEN||'';return !!token && !!expected && safeEqual(token,expected);}
