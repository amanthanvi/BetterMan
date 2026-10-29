#include <fcntl.h>
#include <unistd.h>
int main(void) {
  int fd = open("/scratch/target-ran", O_WRONLY | O_CREAT | O_APPEND, 0600);
  if (fd < 0) return 111;
  if (write(fd, "1", 1) != 1) return 112;
  return close(fd) == 0 ? 0 : 113;
}
