{ ... }: {
  imports = [ ./nginx.nix ];

  systemd.tmpfiles.rules = [
    "d /srv/uem-it.cn 0755 admin users -"
    "d /srv/uem-it.cn/source 0700 admin users -"
    "d /srv/uem-it.cn/releases 0755 admin users -"
    "d /srv/uem-it.cn/logs 0700 admin users -"
  ];

  security.acme = {
    acceptTerms = true;
    certs."uem-it.cn".extraDomainNames = [ "www.uem-it.cn" ];
  };
}
