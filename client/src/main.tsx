import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { FontSizeProvider } from "./contexts/FontSizeContext";
import { UploadManagerProvider } from "./contexts/UploadManagerContext";
import { StorageQuotaProvider } from "./contexts/StorageQuotaContext";
import { GlobalDropZone } from "./components/GlobalDropZone";
import { FileUploadProcessor } from "./components/FileUploadProcessor";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent queries from refetching when window regains focus
      // This fixes the issue where counters reset when switching tabs
      refetchOnWindowFocus: false,
      // Keep data fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

// Upload chunk operations are large payloads that must NOT be batched together.
// Using splitLink to route them through a non-batching httpLink prevents
// multiple 10MB+ base64 chunks from being combined into a single HTTP request
// that exceeds reverse proxy / server body limits.
const UPLOAD_OPERATIONS = new Set([
  'uploadChunk.uploadChunk',
  'uploadChunk.initUpload',
  'uploadChunk.finalizeUpload',
  'uploadChunk.cancelUpload',
  'largeFileUpload.uploadLargeChunk',
  'largeFileUpload.initLargeUpload',
  'largeFileUpload.finalizeLargeUpload',
  'largeFileUpload.cancelLargeUpload',
]);

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition(op) {
        // Route upload chunk operations to the non-batching link
        return UPLOAD_OPERATIONS.has(op.path);
      },
      true: httpLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch(input, init) {
          return globalThis.fetch(input, {
            ...(init ?? {}),
            credentials: "include",
          });
        },
      }),
      false: httpBatchLink({
        url: "/api/trpc",
        transformer: superjson,
        fetch(input, init) {
          return globalThis.fetch(input, {
            ...(init ?? {}),
            credentials: "include",
          });
        },
      }),
    }),
  ],
});

// Register service worker for PWA and Share Target functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('[App] Service worker registered:', registration.scope);
        
        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data.type === 'SHARE_TARGET_FILES') {
            // Store file info in sessionStorage for the Share page
            sessionStorage.setItem('sharedFiles', JSON.stringify(event.data.files));
          }
        });
      })
      .catch((error) => {
        console.error('[App] Service worker registration failed:', error);
      });
  });
}

// Hide splash screen after app loads
const hideSplashScreen = () => {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.style.display = 'none';
    }, 300);
  }
};

// Hide splash after a short delay to ensure smooth transition
setTimeout(hideSplashScreen, 800);

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <FontSizeProvider>
        <StorageQuotaProvider>
          <UploadManagerProvider>
            <FileUploadProcessor />
            <GlobalDropZone>
              <App />
            </GlobalDropZone>
          </UploadManagerProvider>
        </StorageQuotaProvider>
      </FontSizeProvider>
    </QueryClientProvider>
  </trpc.Provider>
);
