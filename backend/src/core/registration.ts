/**
 * Registration service - 注册审批相关业务
 *
 * 与运行环境无关，只依赖统一的 RegistrationRequestRepository。
 */

import type { RegistrationRequestRepository } from "../infrastructure/repositories.js";

export class RegistrationService {
  constructor(private repo: RegistrationRequestRepository) {}

  async listPending(): Promise<Record<string, any>[]> {
    return await this.repo.listPending();
  }

  async approve(id: number): Promise<void> {
    await this.repo.approve(id);
  }

  async reject(id: number): Promise<void> {
    await this.repo.reject(id);
  }

  async create(request: any): Promise<number> {
    return await this.repo.create(request);
  }
}


