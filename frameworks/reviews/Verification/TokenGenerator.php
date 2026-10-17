<?php
namespace AustinShows\Reviews\Verification;

class TokenGenerator
{
    /**
     * Generate and save a verification token for a stakeholder.
     *
     * @param string $userStoryId
     * @param string $stakeholder
     * @param string $verificationDir
     * @return string
     */
    public function generate_and_save_token($userStoryId, $stakeholder, $verificationDir)
    {
        $base = 'ASR-' . strtoupper($stakeholder) . '-' . $userStoryId;
        $random_str = $this->generateRandomString(8);
        $timestamp = substr((string) time(), -4);
        $token = $base . '-' . $random_str . '-' . $timestamp;
        if (!is_dir($verificationDir)) {
            mkdir($verificationDir, 0755, true);
        }
        $tokenFile = $verificationDir . '/' . strtolower($stakeholder) . '_token.txt';
        file_put_contents($tokenFile, $token);
        return $token;
    }

    /**
     * Verify a token for a stakeholder.
     *
     * @param string $token
     * @param string $stakeholder
     * @param string $verificationDir
     * @return bool
     */
    public function verify_token($token, $stakeholder, $verificationDir)
    {
        $tokenFile = $verificationDir . '/' . strtolower($stakeholder) . '_token.txt';
        if (!file_exists($tokenFile)) {
            return false;
        }
        $savedToken = trim(file_get_contents($tokenFile));
        return $token === $savedToken;
    }

    /**
     * Generate a random string.
     *
     * @param int $length
     * @return string
     */
    private function generateRandomString($length)
    {
        $characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        $charactersLength = strlen($characters);
        $randomString = '';
        for ($i = 0; $i < $length; $i++) {
            $randomString .= $characters[rand(0, $charactersLength - 1)];
        }
        return $randomString;
    }
} 