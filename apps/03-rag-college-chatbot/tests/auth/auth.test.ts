import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";

describe("Authentication & Security Suite", () => {
  it("should securely hash passwords and verify bcrypt match", async () => {
    const rawPassword = "SecurePassword@123";
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(rawPassword, salt);

    expect(hash).toBeDefined();
    expect(hash).not.toBe(rawPassword);

    const isMatch = await bcrypt.compare(rawPassword, hash);
    expect(isMatch).toBe(true);

    const isWrongMatch = await bcrypt.compare("WrongPassword", hash);
    expect(isWrongMatch).toBe(false);
  });
});
