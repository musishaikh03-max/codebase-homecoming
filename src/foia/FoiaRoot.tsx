import App from "./FoiaApp";
import { StoreProvider } from "./store";

// Browser-only entry: the store reads localStorage and the app routes on window.location.hash.
export default function FoiaRoot() {
  return (
    <StoreProvider>
      <App />
    </StoreProvider>
  );
}
