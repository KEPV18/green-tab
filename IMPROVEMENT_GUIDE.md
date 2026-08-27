# دليل التحسينات العملية - Practical Improvement Guide

## 🚀 خطوات التنفيذ السريعة

### 1. إصلاح المشاكل الحرجة (تم ✅)

- ✅ إصلاح constructor المكرر في `googleAuth.ts`
- ✅ إصلاح مسارات الاستيراد في `risks.ts` و `capas.ts`

### 2. إنشاء ملفات Environment Variables

قم بإنشاء ملف `.env.local` يدوياً (لأنه محمي من Git):

```bash
# .env.local
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/callback
GOOGLE_REFRESH_TOKEN=your_refresh_token
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
PORT=3001
NODE_ENV=development
VITE_API_URL=http://localhost:3001
```

### 3. تحسين TypeScript Configuration

قم بتحديث `tsconfig.app.json` تدريجياً:

```json
{
  "compilerOptions": {
    "strict": true,  // تفعيل تدريجي
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

---

## 📦 إضافة Dependencies المطلوبة

### للـ Testing:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react
```

### للـ Logging:
```bash
npm install winston
```

### للـ Validation:
```bash
npm install express-validator  # أو استخدام Zod الموجود
```

### للـ Rate Limiting:
```bash
npm install express-rate-limit
```

### للـ Code Quality:
```bash
npm install -D prettier husky lint-staged
```

---

## 🏗️ إعادة هيكلة المشروع (اختياري لكن موصى به)

### الخطوة 1: إنشاء مجلدات جديدة

```bash
mkdir -p server/routes server/middleware server/utils
mkdir -p src/types src/lib src/stores
mkdir -p tests/unit tests/integration
mkdir -p docs/api
```

### الخطوة 2: نقل الملفات

```bash
# نقل routes
mv src/server/risks.ts server/routes/risks.routes.ts
mv src/server/capas.ts server/routes/capas.routes.ts
mv src/server/index.ts server/index.ts
mv src/server/processes.ts server/routes/processes.routes.ts
```

---

## 📝 أمثلة كود للتحسينات

### 1. Error Handling موحد

```typescript
// server/utils/errors.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 'NOT_FOUND', 404);
  }
}
```

```typescript
// server/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
      },
    });
  }

  // Log unexpected errors
  console.error('Unexpected error:', err);
  
  return res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  });
};
```

### 2. API Client موحد

```typescript
// src/lib/apiClient.ts
class ApiClient {
  private baseURL: string;

  constructor() {
    this.baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: { message: 'Request failed' },
      }));
      throw new Error(error.error?.message || 'Request failed');
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
```

### 3. Type Definitions مركزية

```typescript
// src/types/index.ts
export interface Risk {
  riskId: string;
  process: string;
  description: string;
  cause: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  action: string;
  owner: string;
  status: 'Open' | 'Under Review' | 'Controlled' | 'Closed';
  reviewDate: string;
  linkedCAPA?: string;
}

export interface CAPA {
  capaId: string;
  sourceOfCapa: string;
  type: 'Corrective' | 'Preventive';
  descriptionOfIssue: string;
  reference: string;
  rootCauseAnalysis: string;
  correctiveAction: string;
  preventiveAction?: string;
  responsiblePerson: string;
  targetCompletionDate: string;
  status: 'Open' | 'In Progress' | 'Under Verification' | 'Closed';
  effectivenessCheck?: string;
  effectivenessReviewDate?: string;
  closureApproval?: string;
  relatedRisk?: string;
}

export interface Ticket {
  id: string;
  ticketLink: string;
  ratingScore: number;
  customerPhone: string;
  ticketDate: string;
  channel: 'Phone' | 'Chat' | 'Email';
  note?: string;
}
```

### 4. Validation Layer

```typescript
// server/validators/risk.validator.ts
import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const createRiskSchema = z.object({
  process: z.string().min(1, 'Process is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  cause: z.string().min(1, 'Cause is required'),
  likelihood: z.number().min(1).max(5),
  impact: z.number().min(1).max(5),
  action: z.string().min(1, 'Action is required'),
  owner: z.string().min(1, 'Owner is required'),
  reviewDate: z.string().optional(),
  linkedCAPA: z.string().optional(),
});

export const validate = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors,
        });
      }
      next(error);
    }
  };
};
```

### 5. Logger System

```typescript
// server/utils/logger.ts
import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}
```

### 6. Query Client Configuration

```typescript
// src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: 3,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});
```

### 7. Loading States Component

```typescript
// src/components/common/LoadingSpinner.tsx
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

export const LoadingSpinner = ({ 
  size = 'md', 
  className 
}: LoadingSpinnerProps) => {
  return (
    <div className="flex items-center justify-center">
      <Loader2 
        className={cn('animate-spin text-primary', sizeMap[size], className)} 
      />
    </div>
  );
};
```

### 8. Skeleton Loader

```typescript
// src/components/common/Skeleton.tsx
import { Skeleton as UISkeleton } from '@/components/ui/skeleton';

export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => {
  return (
    <div className="space-y-2">
      {[...Array(rows)].map((_, i) => (
        <UISkeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
};

export const CardSkeleton = () => {
  return (
    <div className="space-y-3">
      <UISkeleton className="h-4 w-3/4" />
      <UISkeleton className="h-4 w-full" />
      <UISkeleton className="h-4 w-5/6" />
    </div>
  );
};
```

---

## 🧪 إعداد Testing

### 1. إعداد Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

```typescript
// tests/setup.ts
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

afterEach(() => {
  cleanup();
});
```

### 2. مثال Unit Test

```typescript
// tests/unit/services/riskRegisterService.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RiskRegisterService } from '@/server/services/riskRegisterService';

describe('RiskRegisterService', () => {
  it('should calculate risk score correctly', () => {
    const likelihood = 3;
    const impact = 4;
    const expectedScore = 12;
    
    // Test implementation
    expect(likelihood * impact).toBe(expectedScore);
  });
});
```

---

## 🔒 تحسينات الأمان

### 1. Rate Limiting

```typescript
// server/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // limit login attempts
  message: 'Too many login attempts, please try again later.',
});
```

### 2. Helmet for Security Headers

```bash
npm install helmet
```

```typescript
// server/index.ts
import helmet from 'helmet';

app.use(helmet());
```

---

## 📊 Performance Improvements

### 1. Code Splitting

```typescript
// src/App.tsx
import { lazy, Suspense } from 'react';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

const Index = lazy(() => import('./pages/Index'));
const Settings = lazy(() => import('./pages/Settings'));
const WorkSchedule = lazy(() => import('./pages/WorkSchedule'));

// في Routes:
<Suspense fallback={<LoadingSpinner />}>
  <Route path="/" element={<Index />} />
</Suspense>
```

### 2. Memoization

```typescript
// مثال على استخدام useMemo
const expensiveCalculation = useMemo(() => {
  return data.reduce((acc, item) => acc + item.value, 0);
}, [data]);

// مثال على استخدام useCallback
const handleClick = useCallback((id: string) => {
  // handle click
}, [dependencies]);
```

---

## 🎨 UI/UX Improvements

### 1. Toast Messages محسنة

```typescript
// src/lib/toast.ts
import { toast as sonnerToast } from 'sonner';

export const toast = {
  success: (message: string) => {
    sonnerToast.success(message, {
      duration: 3000,
    });
  },
  error: (message: string) => {
    sonnerToast.error(message, {
      duration: 5000,
    });
  },
  info: (message: string) => {
    sonnerToast.info(message);
  },
};
```

### 2. Error Messages بالعربية

```typescript
// src/lib/errorMessages.ts
export const errorMessages = {
  NETWORK_ERROR: 'حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.',
  UNAUTHORIZED: 'غير مصرح لك بالوصول إلى هذا المورد.',
  NOT_FOUND: 'المورد المطلوب غير موجود.',
  VALIDATION_ERROR: 'البيانات المدخلة غير صحيحة.',
  SERVER_ERROR: 'حدث خطأ في الخادم. يرجى المحاولة لاحقاً.',
} as const;
```

---

## 📚 Documentation

### 1. JSDoc Examples

```typescript
/**
 * Calculates the risk score based on likelihood and impact
 * @param likelihood - Risk likelihood rating (1-5)
 * @param impact - Risk impact rating (1-5)
 * @returns Risk score (likelihood × impact)
 * @throws {Error} If likelihood or impact is out of range
 * 
 * @example
 * ```ts
 * const score = calculateRiskScore(3, 4);
 * // Returns: 12
 * ```
 */
export function calculateRiskScore(
  likelihood: number, 
  impact: number
): number {
  if (likelihood < 1 || likelihood > 5) {
    throw new Error('Likelihood must be between 1 and 5');
  }
  if (impact < 1 || impact > 5) {
    throw new Error('Impact must be between 1 and 5');
  }
  return likelihood * impact;
}
```

---

## ✅ Checklist للتحسينات

### المرحلة 1: إصلاحات حرجة
- [x] إصلاح constructor المكرر
- [x] إصلاح مسارات الاستيراد
- [ ] إنشاء ملفات .env.example
- [ ] تحسين tsconfig.json

### المرحلة 2: البنية
- [ ] إعادة تنظيم المجلدات
- [ ] إنشاء Type Definitions مركزية
- [ ] إضافة Error Handling موحد
- [ ] إضافة Validation Layer

### المرحلة 3: Testing
- [ ] إعداد Vitest
- [ ] كتابة Unit Tests
- [ ] كتابة Integration Tests

### المرحلة 4: الإنتاجية
- [ ] إضافة Logging System
- [ ] إضافة Caching
- [ ] تحسين Performance
- [ ] إضافة Monitoring

### المرحلة 5: CI/CD
- [ ] إعداد GitHub Actions
- [ ] إضافة Pre-commit Hooks
- [ ] تحسين Documentation

---

## 🎯 الأولويات

1. **عاجل**: إصلاح المشاكل الحرجة ✅
2. **مهم**: إضافة Error Handling و Validation
3. **مفيد**: إضافة Testing
4. **تحسين**: Performance و Security
5. **إضافي**: CI/CD و Documentation

---

## 📞 ملاحظات

- ابدأ بالتحسينات البسيطة أولاً
- اختبر كل تغيير قبل الانتقال للتالي
- استخدم Git branches للتحسينات الكبيرة
- راجع الكود مع الفريق قبل الدمج
