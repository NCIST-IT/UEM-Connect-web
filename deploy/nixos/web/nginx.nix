{ config, webPkgs, ... }: {
  environment.systemPackages = [ config.services.nginx.package ];
  services.nginx = {
    enable = true;
    package = webPkgs.nginx;
    enableReload = true;
    serverTokens = false;
    recommendedTlsSettings = true;
    recommendedOptimisation = true;
    recommendedGzipSettings = true;
    virtualHosts."_" = {
      default = true;
      rejectSSL = true;
      locations."/".return = "444";
    };
  };

  services.logrotate = {
    enable = true;
    settings.nginx = {
      frequency = "daily";
      rotate = 14;
      compress = true;
      delaycompress = true;
      maxsize = "20M";
    };
  };
}
