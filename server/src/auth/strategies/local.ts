import { Strategy as LocalStrategy } from 'passport-local';
import passport from '../passport';
import { usersRepository } from '../../db/repositories/users';
import { passwordUtils } from '../utils/password';

const strategy = new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password',
  },
  async (email: string, password: string, done: any) => {
    try {
      // Find user by email
      const user = await usersRepository.findByEmail(email);
      
      if (!user) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      // Check if user has password (OAuth users don't)
      if (!user.password_hash) {
        return done(null, false, { 
          message: 'This account uses OAuth. Please sign in with your provider.' 
        });
      }

      // Verify password
      const isValid = await passwordUtils.verify(password, user.password_hash);
      
      if (!isValid) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      // Skip email verification in dev/console-email mode
      const skipVerification =
        process.env.NODE_ENV === 'development' ||
        process.env.EMAIL_PROVIDER === 'console';

      if (!user.email_verified && !skipVerification) {
        return done(null, false, { 
          message: 'Please verify your email address before logging in' 
        });
      }

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }
);

passport.use('local', strategy);

export default strategy;
