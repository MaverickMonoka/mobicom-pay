import { safeEqual } from '@/lib/crypto';
import { NextResponse } from 'next/server';
export async function POST(req:Request){const form=await req.formData();const token=String(form.get('token')||'');const expected=process.env.ADMIN_TOKEN||'';if(!token||!expected||!safeEqual(token,expected)) return NextResponse.redirect(new URL('/admin/login?error=1',req.url),303);const res=NextResponse.redirect(new URL('/admin',req.url),303);res.cookies.set('mobicom_pay_admin',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:60*60*8});return res;}
