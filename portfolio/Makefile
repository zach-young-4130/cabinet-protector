.PHONY: dev frontend api

dev:
	@trap 'kill 0' INT TERM EXIT; \
	(cd portfolio-api && mise exec -- bundle exec bin/rails server) & \
	(cd portfolio-frontend && mise exec -- npm start) & \
	wait

frontend:
	cd portfolio-frontend && mise exec -- npm start

api:
	cd portfolio-api && mise exec -- bundle exec bin/rails server