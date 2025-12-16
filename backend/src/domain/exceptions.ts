/**
 * Domain Exceptions - 领域异常
 * 
 * 业务相关的异常定义。
 */

export class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AuthenticationError extends DomainException {
  constructor(message: string = 'Authentication failed') {
    super(message);
  }
}

export class AuthorizationError extends DomainException {
  constructor(message: string = 'Authorization failed') {
    super(message);
  }
}

export class ValidationError extends DomainException {
  constructor(message: string = 'Validation failed') {
    super(message);
  }
}

export class JihuAuthExpiredError extends DomainException {
  constructor(message: string) {
    super(`JIHU_AUTH_EXPIRED: ${message}`);
  }
}

