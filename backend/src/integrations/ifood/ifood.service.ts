import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class IfoodService {
  private readonly logger = new Logger(IfoodService.name);
  private readonly IFOOD_API_URL = 'https://merchant-api.ifood.com.br';

  async authenticate(clientId: string, clientSecret: string, timeout = 0): Promise<string | null> {
    try {
      const response = await axios.post(
        `${this.IFOOD_API_URL}/authentication/v1.0/oauth/token`,
        `grantType=client_credentials&clientId=${clientId}&clientSecret=${clientSecret}`,
        { timeout, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      return response.data.accessToken;
    } catch (error: any) {
      this.logger.error(`Falha ao autenticar iFood: ${error.message}`);
      return null;
    }
  }

  async getCatalogs(token: string, merchantId: string): Promise<any[]> {
    try {
      const res = await axios.get(
        `${this.IFOOD_API_URL}/catalog/v2.0/merchants/${merchantId}/catalogs`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return res.data || [];
    } catch {
      return [];
    }
  }

  async syncCatalog(
    token: string,
    merchantId: string,
    products: Array<{
      id: string;
      name: string;
      priceSell: number;
      description?: string;
      categoryName?: string;
      imageUrl?: string;
    }>
  ): Promise<{ synced: number; errors: number; skipped: number }> {
    let synced = 0;
    let errors = 0;
    let skipped = 0;

    const validProducts = products.filter(p => p.priceSell > 0);
    skipped = products.length - validProducts.length;

    if (validProducts.length === 0) return { synced, errors, skipped };

    let catalogId = null;
    try {
      const catRes = await axios.get(
        `${this.IFOOD_API_URL}/catalog/v2.0/merchants/${merchantId}/catalogs`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (catRes.data && catRes.data.length > 0) {
        catalogId = catRes.data[0].catalogId;
      }
    } catch (err: any) {
      this.logger.error(`Erro ao buscar catálogos: ${err.message}`);
      return { synced, errors: validProducts.length, skipped };
    }

    if (!catalogId) {
      this.logger.error(`Nenhum catálogo encontrado para o merchant ${merchantId}`);
      return { synced, errors: validProducts.length, skipped };
    }

    // Buscar categorias existentes no iFood
    let existingCategories: any[] = [];
    try {
      const catListRes = await axios.get(
        `${this.IFOOD_API_URL}/catalog/v2.0/merchants/${merchantId}/catalogs/${catalogId}/categories`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      existingCategories = catListRes.data || [];
    } catch (err) {}

    const categoryMap = new Map<string, string>();
    for (const c of existingCategories) {
      categoryMap.set(c.name.toUpperCase(), c.id);
    }

    for (const product of validProducts) {
      try {
        const catName = product.categoryName || 'Geral';
        let categoryId = categoryMap.get(catName.toUpperCase());

        // Se a categoria não existir, criamos uma nova no iFood
        if (!categoryId) {
          const crypto = require('crypto');
          categoryId = crypto.randomUUID();
          await axios.post(
            `${this.IFOOD_API_URL}/catalog/v2.0/merchants/${merchantId}/catalogs/${catalogId}/categories`,
            {
              id: categoryId,
              name: catName,
              status: "AVAILABLE",
              template: "DEFAULT"
            },
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
          );
          categoryMap.set(catName.toUpperCase(), categoryId as string);
        }

        const ifoodItemId = product.id; // UUID do produto

        let imagePath: string | undefined = undefined;
        if (product.imageUrl) {
          try {
            const { Jimp } = require('jimp');
            const image = await Jimp.read(product.imageUrl);
            
            const w = image.bitmap.width;
            const h = image.bitmap.height;
            // 85% de margem para evitar cortes na simulação de banner (16:9) do iFood
            const size = Math.floor(Math.max(w, h) * 1.85); 
            
            const squareImage = new Jimp({ width: size, height: size, color: 0xFFFFFFFF });
            const x = Math.floor((size - w) / 2);
            const y = Math.floor((size - h) / 2);
            
            squareImage.composite(image, x, y);
            
            // Adiciona pixels quase brancos nas extremidades para enganar o auto-crop do iFood
            squareImage.setPixelColor(0xFEFEFEFF, 0, 0);
            squareImage.setPixelColor(0xFEFEFEFF, size - 1, size - 1);
            
            const base64Str = await squareImage.getBase64('image/png');
            
            const uploadRes = await axios.post(
              `${this.IFOOD_API_URL}/catalog/v2.0/merchants/${merchantId}/image/upload/`,
              { image: base64Str },
              { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );
            imagePath = uploadRes.data?.imagePath;
          } catch (e: any) {
            this.logger.warn(`Falha ao processar/upload da imagem do produto "${product.name}": ${e.message}`);
          }
        }

        await axios.put(
          `${this.IFOOD_API_URL}/catalog/v2.0/merchants/${merchantId}/items`,
          {
            item: {
              id: ifoodItemId,
              type: 'DEFAULT',
              categoryId: categoryId,
              status: 'AVAILABLE',
              price: { value: Number(product.priceSell) },
              externalCode: product.id,
              productId: ifoodItemId // Obrigatório no payload v2.0
            },
            products: [
              {
                id: ifoodItemId,
                name: product.name,
                description: product.description ?? '',
                externalCode: product.id,
                imagePath: imagePath,
              }
            ],
            optionGroups: [],
            options: [],
          },
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );

        synced++;
      } catch (error: any) {
        this.logger.error(`Erro ao sincronizar produto "${product.name}": ${JSON.stringify(error?.response?.data || error.message)}`);
        errors++;
      }
    }

    return { synced, errors, skipped };
  }

  async updateInventory(token: string, merchantId: string, updates: { externalCode: string, stock: number }[], strict = false) {
    try {
      if (!updates.length) return true;

      // O iFood Catalog v2.0 aceita POST individual para cada productId no endpoint /inventory
      // Processando em lotes (chunks) de 10 para não estourar rate limit
      const chunkSize = 10;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        
        const promises = chunk.map(async u => {
          try {
            await axios.post(
              `${this.IFOOD_API_URL}/catalog/v2.0/merchants/${merchantId}/inventory`,
              {
                productId: u.externalCode,
                amount: Math.floor(u.stock) // Sempre inteiro
              },
                { timeout: strict ? 10_000 : 0, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
            );
          } catch (e: any) {
              this.logger.warn(`Erro ao atualizar estoque do item ${u.externalCode}: ${e.response?.data?.message || e.message}`);
              if (strict) throw e;
          }
        });

          const results = await Promise.allSettled(promises);
          if (strict && results.some(result => result.status === 'rejected')) throw new Error('Sincronização parcial do estoque iFood');
      }
      
      return true;
    } catch (e: any) {
        this.logger.error(`Erro fatal ao atualizar estoque no iFood: ${e.message}`);
        if (strict) throw e;
      return false;
    }
  }
}
