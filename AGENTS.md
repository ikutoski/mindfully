# AGENTS.md

This file provides guidelines for AI coding agents working in this repository.

## Project Overview

Multi-agent platform with monorepo structure:
- **server**: Express + tRPC API
- **client**: React + Tailwind + shadcn/ui + Motion + Recharts + React D3 Tree
- **core**: Agent implementations (LangGraph, MCP, A2A, RAG)

Local development only.

## Commands

### Installation
```bash
pnpm install
```

### Development
```bash
pnpm dev          # Start all services (server + client)
```

### Build & Start
```bash
pnpm build        # Build all packages
pnpm start        # Start production server
```

### Testing
```bash
pnpm test         # Run all tests
pnpm test <file>  # Run single test file
```

### Linting & Formatting
```bash
pnpm lint         # Run ESLint
pnpm lint:fix     # Fix ESLint issues
pnpm format       # Format code with Prettier
```

### Type Checking
```bash
pnpm typecheck    # Run TypeScript type checking
```

## Workspace Structure

```
mindful/
├── package.json              # Root workspace
├── pnpm-workspace.yaml
├── server/                   # Express + tRPC API
│   ├── src/
│   │   ├── index.ts          # Entry point
│   │   ├── router/           # tRPC routers
│   │   └── trpc.ts           # tRPC setup
│   └── package.json
├── client/                   # Frontend (React)
│   ├── src/
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
└── core/                     # Agent implementations
    ├── src/
    │   ├── agents/           # Agent definitions
    │   ├── tools/            # MCP tools
    │   ├── memory/           # RAG/Memory
    │   └── index.ts
    └── package.json
```

## Imports

Use absolute imports with workspace names:
```typescript
// Server/Client import from core
import { AgentBuilder } from 'core/agents';

// Within core
import { MemoryService } from 'core/memory';

// Relative imports for local files
import { MyUtil } from './utils';
```

## Code Style Guidelines

### Naming Conventions

- **Files**: kebab-case (e.g., `user-service.ts`, `api-client.ts`)
- **Components**: PascalCase (e.g., `UserProfile.tsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useAuth.ts`)
- **Types/Interfaces**: PascalCase (e.g., `UserResponse`, `ApiError`)
- **Constants**: UPPER_SNAKE_CASE for runtime constants, camelCase for config keys
- **Enums**: PascalCase with PascalCase members

### TypeScript

- Always use explicit types for function parameters and return values
- Use `interface` for object shapes, `type` for unions/aliases
- Avoid `any` - use `unknown` when type is truly unknown
- Use strict null checks

```typescript
// Good
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

function getUserById(id: string): Promise<User | null> {
  // ...
}

// Avoid
function getUser(id: any): Promise<any> {
  // ...
}
```

### Error Handling

Use custom error classes for domain errors:
```typescript
class NotFoundError extends Error {
  constructor(public readonly resource: string, public readonly id: string) {
    super(`${resource} with id ${id} not found`);
    this.name = 'NotFoundError';
  }
}

class ValidationError extends Error {
  constructor(public readonly fields: Record<string, string[]>) {
    super('Validation failed');
    this.name = 'ValidationError';
  }
}
```

Always include error context in try-catch:
```typescript
try {
  await userService.update(id, data);
} catch (error) {
  if (error instanceof NotFoundError) {
    throw new ApiError(404, error.message);
  }
  logger.error('Failed to update user', { id, error });
  throw new ApiError(500, 'Internal server error');
}
```

### Async/Await

Use explicit async/await, never rely on implicit promises:
```typescript
// Good
const user = await db.user.findUnique({ where: { id } });
if (!user) throw new NotFoundError('User', id);

// Avoid
const user = db.user.findUnique({ where: { id } }); // Promise<void>
```

### React/Component Guidelines

- Use functional components with hooks
- Keep components small and focused
- Extract custom hooks for reusable logic
- Use composition over inheritance

```typescript
// Good - small focused component
export function UserCard({ user, onEdit }: UserCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{user.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <UserEmail email={user.email} />
      </CardContent>
      <CardFooter>
        <Button onClick={() => onEdit(user.id)}>Edit</Button>
      </CardFooter>
    </Card>
  );
}
```

### Frontend Design System

The client uses a **Precision Black** theme inspired by [superior.trade](https://www.superior.trade/). All UI work must follow these rules strictly.

#### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0a0a0a` | Page / app background |
| Card bg | `#0e0e0e` | Cards, panels, dropdowns |
| Text primary | `#e0e0e0` | Body text |
| Text heading | `#ffffff` | h1/h2 |
| Text muted | `rgba(255,255,255,0.45)` | Secondary labels |
| Text very muted | `rgba(255,255,255,0.28)` | Timestamps, footers |
| **Accent (lime)** | `#b5ff18` | CTAs, active state, links, running status |
| Accent bg | `rgba(181,255,24,0.08–0.15)` | Accent tinted backgrounds |
| Accent border | `rgba(181,255,24,0.25)` | Active nav border, primary button border |
| Border default | `rgba(255,255,255,0.07)` | All default borders |
| Border hover | `rgba(255,255,255,0.14)` | Hover state borders |
| Error | `rgb(239,68,68)` | Destructive actions |
| Success | `rgb(74,222,128)` | Completed states |
| Header bg | `rgba(10,10,10,0.95)` | Sticky header with backdrop blur |

**CSS variables** (in `index.css`):
```css
--primary: 77 100% 55%;   /* lime #b5ff18 */
--accent:  77 100% 55%;
--background: 0 0% 4%;   /* #0a0a0a */
--radius: 0.125rem;       /* 2px max */
```

#### Typography

- **Font**: `Space Mono` (monospace) — the ONLY font used. No Orbitron, no Inter, no system fonts.
- **Headings**: `font-bold tracking-tight text-white`
- **Body**: `font-mono text-[#e0e0e0]`
- **Labels / tags**: `text-[10px] tracking-[0.3em] uppercase text-[rgba(255,255,255,0.35)]` (use `.label-xs` class)
- `font-display` class is aliased to Space Mono Bold for backward compat

#### Borders & Radius

- **Border radius**: `2px` maximum everywhere (`rounded-sm` in Tailwind). Buttons use `border-radius: 0` per superior.trade.
- **Border width**: always `1px`
- **Default border**: `rgba(255,255,255,0.07)` — set globally via `* { border-color: rgba(255,255,255,0.07) }`

#### Elevation & Effects

- **NO box-shadows** — not even subtle ones
- **NO glow effects** — no `0 0 20px hsl(...)` type shadows
- **NO background gradients** on UI elements — sidebar, header, cards all use flat solid colors
- **NO grain overlay** — `.grain-overlay` class is display:none
- **NO Orbitron** — do not import or use the Orbitron font

#### Component Patterns

```tsx
// Card — flat, no shadow
<div className="bg-[#0e0e0e] border border-[rgba(255,255,255,0.07)] rounded-sm p-4">

// Primary button — lime accent
<button className="auth-button-primary">  // or use CSS class

// Ghost / secondary button
<button className="btn-cyber">  // neutral border, transparent bg

// Active nav item
<Link className="bg-[rgba(181,255,24,0.08)] text-[#b5ff18] border border-[rgba(181,255,24,0.2)]">

// Inactive nav item
<Link className="text-[rgba(255,255,255,0.45)] hover:text-[#e0e0e0] hover:bg-[rgba(255,255,255,0.04)]">

// Status dot — running
<span className="status-dot running" />  // lime + pulse animation

// Label / tag
<span className="label-xs">Status</span>
```

#### CSS Utility Classes (defined in `client/src/styles/`)

| Class | Description |
|-------|-------------|
| `.card-cyber` | Flat `#0e0e0e` card with `rgba(255,255,255,0.07)` border |
| `.btn-cyber` | Neutral ghost icon button |
| `.btn-cyber-sm/md/lg` | Sized icon buttons |
| `.icon-wrap` | Neutral icon container |
| `.label-xs` | 10px uppercase tracking label |
| `.status-dot` | 6px status indicator dot |
| `.auth-button` | Ghost auth form button |
| `.auth-button-primary` | Lime primary auth button |
| `.auth-input` | Flat auth text input |
| `.agent-card` | Dashboard agent card |
| `.feed-card` | Activity feed card |
| `.text-gradient-cyber` | Lime text (backward compat — no gradient) |
| `.text-cyber` | Lime `#b5ff18` text |

#### Navigation Active State

`Sidebar.tsx` uses `useLocation()` for active detection:
- `/` → exact match only
- All other routes → `pathname.startsWith(href)`

Active: `bg-[rgba(181,255,24,0.08)] text-[#b5ff18] border-[rgba(181,255,24,0.2)]`
Inactive: `text-[rgba(255,255,255,0.45)] hover:text-[#e0e0e0]`

#### Tailwind v4 @apply Rules

In Tailwind v4, `@apply` of custom CSS classes defined in the same file is **not allowed**. Always inline the shared properties instead:

```css
/* ❌ Wrong — will throw "Cannot apply unknown utility class" */
.btn-cyber-sm { @apply btn-cyber h-8 w-8; }

/* ✅ Correct — inline the properties */
.btn-cyber-sm {
  @apply flex items-center justify-center h-8 w-8 transition-colors duration-150;
  border-radius: 2px;
  border: 1px solid rgba(255,255,255,0.08);
}
```

### tRPC Procedures

Define procedures following RESTful conventions:
```typescript
// public procedures
export const userRouter = router({
  list: publicProcedure
    .query(async () => { /* ... */ }),
  
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => { /* ... */ }),

// protected procedures
  create: protectedProcedure
    .input(userSchema)
    .mutation(async ({ ctx, input }) => { /* ... */ }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: userSchema }))
    .mutation(async ({ ctx, input }) => { /* ... */ }),
});
```

### Agent Definitions (BIO.md)

When creating agent definitions in `core/src/agents/`:
- Define clear role and specialization
- List all available tools
- Specify behavior patterns (plan-first, validate changes, etc.)
- Include success criteria

```markdown
# Agent: CodeArchitect
## Specialization
System design, architecture decisions, code review

## Tools
- read, grep, edit, bash
- mcp__filesystem
- mcp__web_search

## Behavior
- Always plan before executing
- Validate changes with tests
- Request confirmation for destructive operations

## Success Criteria
- Code compiles without errors
- Tests pass
- No security vulnerabilities
```

### Testing Guidelines

- Use Vitest for unit tests
- Follow AAA pattern: Arrange, Act, Assert
- Test behavior, not implementation
- Mock external dependencies
- Name tests descriptively

```typescript
describe('UserService', () => {
  describe('getById', () => {
    it('should return user when user exists', async () => {
      // Arrange
      const mockUser = { id: '1', name: 'John' };
      mockDb.user.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await userService.getById('1');

      // Assert
      expect(result).toEqual(mockUser);
    });

    it('should return null when user does not exist', async () => {
      // Arrange
      mockDb.user.findUnique.mockResolvedValue(null);

      // Act
      const result = await userService.getById('999');

      // Assert
      expect(result).toBeNull();
    });
  });
});
```

### Core Package Structure

```
core/src/
├── agents/           # Agent implementations (LangGraph)
│   ├── base/         # Base agent class
│   └── types/        # Agent type definitions
├── tools/            # MCP tools
│   ├── filesystem/
│   ├── web-search/
│   └── ...
├── memory/           # RAG/Memory (Qdrant client)
├── a2a/              # A2A protocol implementation
└── index.ts          # Exports
```

### Database

- Use Prisma or Drizzle as ORM
- Define migrations in `prisma/migrations/`
- Never expose raw SQL to the client
- Use transactions for multi-table operations

### Security

- Validate all user input with Zod schemas
- Sanitize data before logging
- Never expose secrets in error messages
- Use parameterized queries (handled by ORM)
- Implement rate limiting on public endpoints
