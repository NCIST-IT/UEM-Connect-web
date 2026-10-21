{ ... }: {
  imports = [
    ./nginx.nix
    ./net.nix
    ./uem-it.cn
  ];

  programs.direnv = {
    enable = true;
    enableBashIntegration = true;
    nix-direnv.enable = true;
  };
}
