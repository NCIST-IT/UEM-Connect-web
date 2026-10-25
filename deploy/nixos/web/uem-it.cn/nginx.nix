{ ... }:
let
  headers = import ./security.nix;
in {
  services.nginx.appendHttpConfig = ''
    map $uri $uem_it_cache_control {
      default "no-cache";
      ~^/assets/ "public, max-age=31536000, immutable";
      ~^/images/ "public, max-age=86400, stale-while-revalidate=604800";
    }
  '';

  services.nginx.virtualHosts = {
    "uem-it.cn" = {
      enableACME = true;
      forceSSL = true;
      root = "/srv/uem-it.cn/current";
      extraConfig = headers + ''
        autoindex off;
        client_max_body_size 1m;
        add_header Cache-Control $uem_it_cache_control;
        access_log /var/log/nginx/uem-it.cn.access.log combined;
        error_log /var/log/nginx/uem-it.cn.error.log warn;
      '';
      locations = {
        "/".tryFiles = "$uri $uri/ =404";
        # The NixOS ACME integration supplies a ^~ challenge location.
        "~ /\\.".return = "404";
        "~* \\.shortcut$" = {
          tryFiles = "$uri =404";
          extraConfig = ''
            types { }
            default_type application/octet-stream;
          '';
        };
      };
    };
    "www.uem-it.cn" = {
      useACMEHost = "uem-it.cn";
      forceSSL = true;
      extraConfig = headers;
      locations = {
        "/".return = "301 https://uem-it.cn$request_uri";
      };
    };
  };
}
