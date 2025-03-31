import sodium from "libsodium-wrappers";

export async function updateGitHubSecret(name: string, value: string, githubToken: string): Promise<boolean> {
  if (process.env.USING_ACTIONS !== "true") {
    console.log("Not running in GitHub USING_ACTIONs, skipping secret update");
    return false;
  }

  try {
    const [user, repoName] = process.env.REPOSITORY?.split("/") || [];

    if (!repoName) {
      throw new Error("REPOSITORY environment variable not set");
    }

    if (!user) {
      throw new Error("USER environment variable not set");
    }

    console.log(`Updating COOKIE secret for ${user}/${repoName}`);

    const keyResponse = await fetch(`https://api.github.com/repos/${user}/${repoName}/actions/secrets/public-key`, {
      method: "GET",
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `Bearer ${githubToken}`,
        "User-Agent": "hoyolab-tools",
      },
    });

    if (!keyResponse.ok) {
      const errorText = await keyResponse.text();
      throw new Error(`Failed to get public key (${keyResponse.status}): ${errorText}`);
    }

    const { key, key_id } = await keyResponse.json();
    await sodium.ready;

    const publicKey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
    const secretBytes = sodium.from_string(value);
    const encryptedBytes = sodium.crypto_box_seal(secretBytes, publicKey);
    const encryptedValue = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

    const updateResponse = await fetch(`https://api.github.com/repos/${user}/${repoName}/actions/secrets/${name}`, {
      method: "PUT",
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "Authorization": `Bearer ${githubToken}`,
        "Content-Type": "application/json",
        "User-Agent": "hoyolab-tools",
      },
      body: JSON.stringify({
        encrypted_value: encryptedValue,
        key_id,
      }),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Failed to update secret (${updateResponse.status}): ${errorText}`);
    }

    console.log(`Successfully updated GitHub secret for ${user}/${repoName}`);
    return true;
  } catch (error) {
    console.log(`Error updating GitHub secret: ${error}`);
    return false;
  }
}
