import { redirect } from 'next/navigation';

/** The old shop console now lives at /dashboard (and /start for new promos). */
export default function MerchantRedirect() {
  redirect('/dashboard');
}
