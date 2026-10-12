import localtunnel from "localtunnel";

async function main() {
  console.log("Creating secure public tunnel for port 3000...");
  try {
    const tunnel = await localtunnel({ port: 3000 });
    console.log("\n=======================================================");
    console.log("🚀 MOBILE ACCESS URL (HTTPS):");
    console.log(tunnel.url);
    console.log("=======================================================\n");

    tunnel.on("close", () => {
      console.log("Tunnel closed");
    });
    tunnel.on("error", (err) => {
      console.error("Tunnel error:", err);
    });
  } catch (err) {
    console.error("Failed to establish tunnel:", err);
  }
}

main();
