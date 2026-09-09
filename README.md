# Remix of AI Moodboard Canvas

# AI Agent Prompt

## Project Overview

Inspo is a web-based visual mood board and inspiration canvas platform that serves as a centralized hub for collecting, organizing, and sharing visual references. The product addresses the fragmentation problem where creatives use multiple disconnected tools (Pinterest, Figma, Notion, screenshots, bookmarks) to gather inspiration. Inspo consolidates this workflow into a single, visual-first interface optimized for speed, flexibility, and collaboration. The platform is designed for designers, creative directors, product managers, and creative teams who need rapid inspiration capture and intuitive visual organization without the complexity of full design tools or the social overhead of Pinterest.

## Core Functionality

- **Rapid Capture System**: One-click capture from web (browser extension), direct uploads, URL imports, and screenshot integration

- **Canvas-Based Organization**: Infinite, zoomable canvas where users arrange inspiration boards spatially with drag-and-drop functionality

- **Visual Collections**: Create multiple boards/projects with custom naming, descriptions, and visual thumbnails

- **Annotation & Metadata**: Add notes, color tags, mood labels, typography references, and custom metadata to individual items

- **Color Palette Extraction**: Automatic color palette generation from images with manual refinement options

- **Collaborative Workspaces**: Share boards with team members, enable commenting, version history, and real-time collaboration

- **Search & Discovery**: Full-text search across notes and metadata, tag-based filtering, and visual similarity search

- **Export & Integration**: Export boards as PDF, image, or design system specs; integration with Figma, design tools

## User Journey

1. **Onboarding**: User signs up, creates first board, installs browser extension (optional)

2. **Inspiration Capture**: User encounters visual inspiration while browsing; captures via extension, upload, or link

3. **Organization**: User arranges captured items on canvas, adds notes, tags, and mood labels

4. **Refinement**: User groups related items, extracts color palettes, annotates design decisions

5. **Collaboration**: User shares board with team, receives feedback through comments and suggestions

6. **Export & Application**: User exports board for design handoff, design system documentation, or stakeholder presentation

7. **Iteration**: User revisits board, updates inspiration, tracks evolution of design direction

## Technical Requirements

- **Frontend**: React/Next.js with TypeScript, Tailwind CSS for styling, Canvas API or Konva.js for spatial canvas rendering

- **Backend**: Node.js/Express or Python/FastAPI with PostgreSQL for relational data, Redis for real-time features

- **Image Processing**: Sharp or ImageMagick for thumbnail generation, color extraction (color-thief or similar)

- **Storage**: AWS S3 or equivalent for image storage with CDN distribution

- **Authentication**: OAuth 2.0 (Google, GitHub, Apple), JWT tokens, session management

- **Real-Time**: WebSocket implementation for collaborative features, operational transformation or CRDT for conflict resolution

- **Browser Extension**: Manifest V3 compatible extension for Chrome, Firefox, Safari

- **Performance**: Target <2s initial load, <500ms capture-to-canvas, <1s search results

- **Scalability**: Horizontal scaling with load balancing, database connection pooling, caching strategy

## API Integrations

- **Figma API**: Export mood boards as Figma files, sync design tokens

- **Slack Integration**: Share board links, post board updates to channels

- **Google Drive/Dropbox**: Import images from cloud storage

- **Unsplash/Pexels API**: Optional integration for stock photo discovery

- **Color Palette APIs**: Integration with design system tools for color standardization

- **Email**: Transactional emails for sharing, invitations, notifications

- **Analytics**: Segment or Mixpanel for usage tracking and product insights

## Real-Time Features

- **Live Collaboration**: Multiple users editing same board simultaneously with cursor presence indicators

- **Instant Notifications**: Real-time alerts for comments, shares, and board updates

- **Presence Awareness**: Show which team members are currently viewing/editing a board

- **Live Sync**: Changes propagate across all connected clients within 500ms

- **Activity Feed**: Real-time log of board changes, comments, and collaborator actions

- **Conflict Resolution**: Automatic merging of concurrent edits using operational transformation

## Implementation Details

- **Architecture**: Microservices with API Gateway, separate services for auth, images, collaboration, search

- **Database Schema**: Users, Boards, Items (images/references), Collections, Comments, Collaborators, Tags, Metadata

- **Caching Strategy**: Redis for session data, board metadata, frequently accessed collections; CDN for images

- **Image Pipeline**: Upload → validation → thumbnail generation → S3 storage → CDN distribution

- **Search Implementation**: Elasticsearch for full-text search across notes/metadata, vector embeddings for visual similarity (future)

- **Deployment**: Docker containers, Kubernetes orchestration, CI/CD with GitHub Actions

- **Monitoring**: Sentry for error tracking, DataDog for performance monitoring, custom dashboards for product metrics

- **Security**: HTTPS/TLS, CORS configuration, rate limiting, input validation, SQL injection prevention, XSS protection

## MVP Features

- User authentication and profile management

- Create, edit, delete boards/collections

- Drag-and-drop canvas with infinite zoom

- Upload images and add URLs

- Browser extension for one-click capture

- Basic tagging and note annotation

- Share boards with read-only or edit access

- Comment functionality on items

- Color palette extraction from images

- Search across boards and items

- Export board as PDF or image

- Basic real-time collaboration (live cursors, instant sync)

- Mobile-responsive design (view-only on mobile MVP)

## Future Features

- AI-powered curation and recommendation engine

- Advanced visual similarity search

- Design system integration and token sync

- Team workspaces with permission hierarchies

- Board templates and starter kits

- Mood board analytics (most-referenced colors, styles, trends)

- Integration with design tools (Figma, Adobe XD, Sketch)

- Mobile app with offline support

- Advanced collaboration (version history, branching)

- Marketplace for sharing public mood boards

- AI-generated mood board suggestions based on project brief

- Voice/audio annotations

- 3D mood board visualization

## User Experience Guidelines

- **Speed First**: Every interaction should feel instant; optimize for <500ms response times

- **Visual Clarity**: Large, beautiful image previews; minimize text-heavy interfaces

- **Spatial Intuition**: Canvas organization should feel natural and physical, like arranging items on a table

- **Minimal Friction**: Capture should be 1-2 clicks maximum; no required fields beyond image

- **Collaborative Presence**: Always show who's working on a board; make collaboration feel social but not intrusive

- **Accessibility**: WCAG 2.1 AA compliance, keyboard navigation, screen reader support, color contrast standards

- **Responsive Design**: Seamless experience from desktop (primary) to tablet (secondary) to mobile (view-only)

- **Dark/Light Modes**: Support both themes with automatic detection and manual toggle

- **Onboarding**: Interactive tutorial for first-time users, empty state guidance, contextual help

## Code Quality Standards

- **Language**: TypeScript for type safety across frontend and backend

- **Linting**: ESLint with Airbnb config, Prettier for code formatting

- **Testing**: Jest for unit tests (>80% coverage), React Testing Library for component tests, Cypress for E2E tests

- **Documentation**: JSDoc comments for functions, README files for modules, API documentation with Swagger/OpenAPI

- **Git Workflow**: Feature branches, pull request reviews, conventional commits

- **Performance**: Lighthouse scores >90, Core Web Vitals optimization, bundle size monitoring

- **Security**: OWASP Top 10 compliance, regular dependency audits, security headers (CSP, X-Frame-Options, etc.)

- **Code Review**: Mandatory peer review, automated checks (linting, tests, security scanning)

## Deliverable Format

- **Frontend Code**: React/Next.js components organized by feature, shared utilities, hooks, and context

- **Backend Code**: API routes, database models, middleware, services, and controllers with clear separation of concerns

- **Database Schema**: SQL migration files, ER diagrams, documentation of relationships

- **API Documentation**: Swagger/OpenAPI spec with all endpoints, request/response schemas, authentication requirements

- **Browser Extension**: Manifest file, content scripts, background service worker, popup UI

- **Deployment Configuration**: Docker Compose for local development, Kubernetes manifests for production, environment variable documentation

- **Testing Suite**: Unit tests, integration tests, E2E test scenarios with clear setup and teardown

- **Product Documentation**: User guides, feature walkthroughs, FAQ, troubleshooting guide

- **Design System**: Figma file with components, color palette, typography, spacing guidelines

- **Analytics Dashboard**: Custom dashboard showing key metrics (DAU, capture rate, collaboration events, retention)

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e8925812-e861-40fe-89fd-38bc287dafd9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
