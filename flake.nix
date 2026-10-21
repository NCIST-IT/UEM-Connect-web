{
  description = "Build and update uem-it.cn";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { nixpkgs, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      nodejs = pkgs.stdenvNoCC.mkDerivation rec {
        pname = "nodejs";
        version = "24.22.1";
        src = pkgs.fetchurl {
          url = "https://nodejs.org/dist/v${version}/node-v${version}-linux-x64.tar.xz";
          hash = "sha256-bBcqmrZxj3uAH7WnvUhq8u5eMnWAhqBLhPzOKqdwleY=";
          curlOptsList = [ "--ipv4" ];
        };
        nativeBuildInputs = [ pkgs.autoPatchelfHook ];
        buildInputs = [ pkgs.stdenv.cc.cc.lib ];
        dontBuild = true;
        dontStrip = true;
        installPhase = ''
          runHook preInstall
          mkdir -p "$out"
          cp -R bin lib include share "$out/"
          cp LICENSE "$out/LICENSE"
          runHook postInstall
        '';
        meta = {
          description = "Node.js LTS official security release";
          homepage = "https://nodejs.org/";
          license = pkgs.lib.licenses.mit;
          platforms = [ system ];
          mainProgram = "node";
        };
      };
      tools = with pkgs; [
        gitMinimal
        nodejs
        pnpm_12
        python3
        curl
        coreutils
        util-linux
      ];

      update = pkgs.writeShellApplication {
        name = "uem-update";
        runtimeInputs = tools;
        text = ''
          if [[ "''${1:-}" == --help ]]; then
            echo 'Usage: uem-update (or nix run /srv/uem-it.cn#update)'
            echo 'Pull main, install dependencies, lint/build/test, then publish atomically.'
            exit 0
          fi
          if (( $# != 0 )); then
            echo 'No arguments expected. Use --help for usage.' >&2
            exit 64
          fi
          if [[ $(id -un) != admin ]]; then
            echo 'Run as admin, without sudo.' >&2
            exit 1
          fi

          umask 022
          site=/srv/uem-it.cn
          exec 9>"$site/.update.lock"
          flock -n 9 || { echo 'Another update is running.' >&2; exit 1; }
          cd "$site/source"
          test "$(git branch --show-current)" = main
          test -z "$(git status --porcelain)" || {
            echo 'Source has local changes; resolve them before updating.' >&2
            exit 1
          }
          git pull --ff-only origin main

          commit=$(git rev-parse HEAD)
          release="$(date -u +%Y%m%dT%H%M%SZ)-$(git rev-parse --short=12 HEAD)"
          exec > >(tee -a "$site/logs/$release.log") 2>&1
          export CI=true
          export NODE_OPTIONS=--max-old-space-size=512
          export RAYON_NUM_THREADS=1
          export UV_THREADPOOL_SIZE=2
          pnpm install --frozen-lockfile --ignore-scripts --network-concurrency=4 --child-concurrency=1
          pnpm lint
          pnpm build
          pnpm test

          staging=$(mktemp -d "$site/releases/.update.XXXXXXXX")
          link="$site/.current.$$"
          trap 'rm -rf -- "$staging"; rm -f -- "$link"' EXIT
          cp -R dist/. "$staging/"
          chmod -R u=rwX,go=rX "$staging"
          test -s "$staging/index.html"
          test ! -e "$site/releases/$release"
          mv "$staging" "$site/releases/$release"

          previous=$(readlink "$site/current")
          ln -s "releases/$release" "$link"
          mv -Tf "$link" "$site/current"
          expected=$(sha256sum "$site/current/index.html")
          expected=''${expected%% *}
          if actual=$(curl --noproxy '*' --fail --silent --show-error --max-time 15 \
              --resolve uem-it.cn:443:127.0.0.1 https://uem-it.cn/ | sha256sum) \
              && [[ ''${actual%% *} == "$expected" ]]; then
            printf '%s\n' "$commit" > "$site/logs/$release.commit"
            printf 'Published: %s\nPrevious: %s\n' "$release" "$previous"
          else
            ln -s "$previous" "$link"
            mv -Tf "$link" "$site/current"
            echo 'HTTPS/content check failed; restored the previous release.' >&2
            exit 1
          fi
        '';
      };
    in {
      packages.${system} = { inherit nodejs update; };

      apps.${system}.update = {
        type = "app";
        program = "${update}/bin/uem-update";
        meta.description = "Update, check and publish uem-it.cn";
      };

      devShells.${system}.default = pkgs.mkShellNoCC {
        packages = tools ++ [ update ];
        NODE_OPTIONS = "--max-old-space-size=512";
        RAYON_NUM_THREADS = "1";
        UV_THREADPOOL_SIZE = "2";
      };
    };
}
