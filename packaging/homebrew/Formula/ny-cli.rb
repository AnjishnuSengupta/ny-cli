class NyCli < Formula
  desc "Terminal anime streaming client with artwork display and cloud sync"
  homepage "https://github.com/AnjishnuSengupta/ny-cli"
  url "https://registry.npmjs.org/@anjishnusengupta/ny-cli/-/ny-cli-7.1.0.tgz"
  sha256 "REPLACE_WITH_ACTUAL_SHA256_ON_RELEASE"
  license "MIT"

  depends_on "node"
  depends_on "mpv" => :recommended
  depends_on "ffmpeg" => :recommended
  depends_on "chafa" => :optional

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    output = shell_output("#{bin}/ny-cli --version 2>&1")
    assert_match "7.1.0", output
  end
end

