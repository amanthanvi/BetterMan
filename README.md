# BetterMan

BetterMan is an innovative, modern reinterpretation of Linux man pages. This project transforms traditional Unix documentation into a more readable, navigable, and accessible format—with an architectural foundation designed for future expansion into additional languages and libraries such as Python, Go, Pwntools, and more.

## Overview

- **Modern Presentation:** Clean, approachable UI with improved typography and navigation.
- **MVP Focus:** Starting with Linux man pages.
- **Expandable Framework:** A modular design allowing new documentation sets to be added easily.

## Key Features

- **Readable Formatting:** Converts legacy man pages into Markdown/HTML with enhanced readability.
- **Search & Navigation:** Intuitive, full-text search, dynamic table of contents, and interconnected hyperlinks.
- **Extensibility:** A modular structure to incorporate additional documentation sources seamlessly.
- **Developer-Friendly:** Clear code organization, consistent style guidelines, and comprehensive project documentation.

## Getting Started

### Prerequisites

- [Git](https://git-scm.com/)
- [Python 3.x](https://www.python.org/) (or your chosen runtime environment)
- Node.js (if using the React-based frontend)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/BetterMan.git
   ```
2. Change into the project directory:
   ```bash
   cd BetterMan
   ```
3. Install backend dependencies (for example, using `pip`):
   ```bash
   pip install -r requirements.txt
   ```

### Running the Project

- **Backend:** Start the API server:
   ```bash
   uvicorn src.server:app --reload
   ```
- **Frontend:** If using a separate React frontend, run it as specified in its own README.

## Contributing

For contributions, please check our [CONTRIBUTING](./CONTRIBUTING.md) guidelines for details on code style, branch naming, and pull request processes.

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for planned features and future milestones.

## License

This project is licensed under the MIT License.
