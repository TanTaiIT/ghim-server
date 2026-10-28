import type { AppModule } from '../../common/module/app-module.js';
import { walletRoutes } from './wallet.routes.js';
import {
  createWalletService,
  type WalletService,
  type WalletServiceDeps,
} from './wallet.service.js';

/** Ví Xu (change add-wallet): dựng sau `identity`, trước `ops`; không bên nghe nào ở change này (design mục 7). */
export function createWalletModule(deps: WalletServiceDeps): {
  service: WalletService;
  module: AppModule;
} {
  const service = createWalletService(deps);
  return {
    service,
    module: {
      name: 'wallet',
      routes: async (app) => {
        await app.register(walletRoutes, { wallet: service });
      },
    },
  };
}
