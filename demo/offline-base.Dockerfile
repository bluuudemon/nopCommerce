# Stand-in for the Microsoft runtime images when mcr.microsoft.com cannot
# be pulled. demo/prepare-offline-bases.sh tags this as both
# mcr.microsoft.com/dotnet/sdk:10.0-alpine and
# mcr.microsoft.com/dotnet/aspnet:10.0-alpine so the repository Dockerfile
# can build unchanged. The `apk` shim ignores the Alpine package steps;
# globalization libraries are installed from the Ubuntu package instead.
FROM ubuntu:24.04

COPY libicu74.deb /tmp/libicu74.deb
RUN dpkg -i /tmp/libicu74.deb && rm /tmp/libicu74.deb

COPY dotnet/ /usr/share/dotnet/
RUN ln -sf /usr/share/dotnet/dotnet /usr/bin/dotnet \
    && groupadd --gid 1654 app \
    && useradd --uid 1654 --gid 1654 --create-home --shell /bin/sh app \
    && printf '%s\n' '#!/bin/sh' 'exit 0' > /usr/local/bin/apk \
    && chmod 755 /usr/local/bin/apk

COPY nuget-feed/ /nuget-feed/
COPY NuGet.Config /root/.nuget/NuGet/NuGet.Config

# The installed packs are 10.0.14. This SDK asks for the 10.0.12
# targeting packs by name. Point those versions at the installed bits
# so restore does not have to download them.
RUN for pack in Microsoft.NETCore.App.Ref Microsoft.AspNetCore.App.Ref Microsoft.NETCore.App.Host.linux-x64; do \
      if [ -d "/usr/share/dotnet/packs/${pack}/10.0.14" ]; then \
        ln -sfn 10.0.14 "/usr/share/dotnet/packs/${pack}/10.0.12"; \
      fi; \
    done

ENV DOTNET_ROOT=/usr/share/dotnet \
    PATH=/usr/share/dotnet:/usr/local/bin:${PATH} \
    DOTNET_NOLOGO=1 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NUGET_SIGNATURE_VERIFICATION=false \
    NUGET_CERT_REVOCATION_MODE=offline \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false \
    NUGET_PACKAGES=/nuget-cache
