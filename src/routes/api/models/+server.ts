import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getModelCatalog, refreshModelCatalog } from '$lib/server/oev';

export const GET: RequestHandler = async ({ request }) => {
	try { return json(await getModelCatalog(request.signal), { headers: { 'cache-control': 'no-store' } }); }
	catch (error) { return json({ message: error instanceof Error ? error.message : '모델 목록을 불러오지 못했습니다.' }, { status: 502, headers: { 'cache-control': 'no-store' } }); }
};

export const POST: RequestHandler = async ({ request, url }) => {
	if (request.headers.get('origin') !== url.origin) return json({ message: '같은 앱에서 모델 목록을 새로고침해 주세요.' }, { status: 403 });
	try { return json(await refreshModelCatalog(request.signal), { headers: { 'cache-control': 'no-store' } }); }
	catch (error) { return json({ message: error instanceof Error ? error.message : '모델 목록을 갱신하지 못했습니다.' }, { status: 502, headers: { 'cache-control': 'no-store' } }); }
};
