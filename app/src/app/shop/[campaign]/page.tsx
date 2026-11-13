import { redirect } from 'next/navigation';

/** Old customer links → the new promo page. */
export default async function ShopRedirect({ params }: { params: Promise<{ campaign: string }> }) {
  const { campaign } = await params;
  redirect(`/p/${campaign}`);
}
