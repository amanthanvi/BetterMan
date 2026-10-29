FROM debian:trixie
RUN apt-get update && apt-get install -y --no-install-recommends sudo opendoas time findutils coreutils bash gcc libc6-dev python3 && rm -rf /var/lib/apt/lists/*
COPY marker.c /tmp/marker.c
RUN gcc -O2 -o /tmp/marker /tmp/marker.c && cp /tmp/marker /usr/bin/rm && cp /tmp/marker /usr/bin/truncate && printf 'Defaults lecture=never\nroot ALL=(ALL) NOPASSWD: ALL\n' > /etc/sudoers.d/explain && chmod 440 /etc/sudoers.d/explain && printf 'permit nopass root as root\n' > /etc/doas.conf
COPY driver.py /driver.py
ENTRYPOINT ["python3", "/driver.py"]
