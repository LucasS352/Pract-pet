import { AppController } from '../app.controller';

function harness(header?: string) {
  const findUnique = jest.fn().mockResolvedValue({ id: 'img', mimeType: 'image/webp', data: Buffer.from('bytes') });
  const res: any = { req: { headers: { 'if-none-match': header } }, setHeader: jest.fn(), status: jest.fn(), send: jest.fn(), end: jest.fn() };
  res.status.mockReturnValue(res); res.send.mockReturnValue(res); res.end.mockReturnValue(res);
  return { controller: new AppController({ image: { findUnique } } as any), findUnique, res };
}
describe('immutable product image delivery', () => {
  it('conditional hits query only metadata, never the blob', async () => {
    for (const header of ['"img"', 'W/"img"', '"other", "img"', '*']) {
      const h = harness(header); await h.controller.serveProductImage('img', h.res);
      expect(h.findUnique).toHaveBeenCalledWith({ where: { id: 'img' }, select: { id: true, mimeType: true } });
      expect(h.res.status).toHaveBeenCalledWith(304); expect(h.res.send).not.toHaveBeenCalled();
    }
  });
  it('ordinary GET returns bytes and immutable headers', async () => {
    const h = harness(); await h.controller.serveProductImage('img', h.res);
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: 'img' } });
    expect(h.res.send).toHaveBeenCalledWith(Buffer.from('bytes'));
    expect(h.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=31536000, immutable');
  });
  it('missing images do not become cache hits; transient failures are not cached 404s', async () => {
    const h = harness('"img"'); h.findUnique.mockResolvedValue(null);
    await h.controller.serveProductImage('img', h.res);
    expect(h.res.status).toHaveBeenCalledWith(404);
    expect(h.res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    const failure = harness(); failure.findUnique.mockRejectedValue(Error('DB unavailable'));
    await failure.controller.serveProductImage('img', failure.res);
    expect(failure.res.status).toHaveBeenCalledWith(503);
  });
});
