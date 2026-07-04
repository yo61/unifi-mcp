export class UnifiError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UnifiError";
  }
}

export class UnifiAuthError extends UnifiError {
  readonly status?: number;
  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "UnifiAuthError";
    if (options?.status !== undefined) this.status = options.status;
  }
}

export class UnifiApiError extends UnifiError {
  readonly operationId: string;
  readonly status?: number;
  constructor(message: string, options: { operationId: string; status?: number; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "UnifiApiError";
    this.operationId = options.operationId;
    if (options.status !== undefined) this.status = options.status;
  }
}

export class UnifiTransportError extends UnifiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = "UnifiTransportError";
  }
}
